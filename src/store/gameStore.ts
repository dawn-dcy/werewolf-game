import { create } from 'zustand';
import { GameState, GamePhase, Role, Player, RoundSummary, NightActionRecord, HunterShootPending } from '../types/game';
import { shuffleRoles, generateAINames, generateAvatarSeed, checkGameOver, getRoleDistribution } from '../utils/gameLogic';
import {
  aiWerewolfChooseTarget,
  aiSeerChooseTarget,
  aiWitchDecide,
  aiGuardChooseTarget,
  aiGenerateDiscussion,
  aiGenerateTieSpeech,
  aiVote,
  aiTieVote,
  isAIConfigured,
  callLLM,
  buildRoleSystemPrompt,
  buildWerewolfNightVoteContext,
  extractPlayerName,
  findPlayerIdByName,
  generateRoundSummary,
  generateFallbackSummary,
  aiHunterChooseTarget,
  aiSelectMVP,
  getRoundHistory,
  buildPlayerActionHistory,
  getAIName,
} from '../services/aiService';

interface GameStore {
  username: string;
  isLoggedIn: boolean;
  setUsername: (name: string) => void;
  login: () => void;
  logout: () => void;

  gameState: GameState | null;
  selectedPlayerCount: number | null;

  selectPlayerCount: (count: number) => void;
  startGame: () => void;
  reshuffleRoles: () => void;
  advancePhase: () => void;

  selectWerewolfTarget: (playerId: string) => void;
  selectSeerTarget: (playerId: string) => void;
  witchUseAntidote: (use: boolean) => void;
  witchUsePoison: (playerId: string | null) => void;
  selectGuardTarget: (playerId: string) => void;

  selectHunterTarget: (targetId: string) => void;

  castVote: (targetId: string) => void;
  castTieVote: (targetId: string) => void;

  sendDiscussionMessage: (content: string) => void;
  generateAIDiscussion: () => void;
  continueTieSpeakers: () => void;

  resetGame: () => void;
  restartGame: () => void;
}

const createEmptyState = (): GameState => ({
  players: [],
  phase: 'lobby',
  round: 0,
  gameResult: null,
  logs: [],
  discussionMessages: [],
  roundSummaries: [],
  discussionOrder: [],
  currentSpeakerIndex: -1,
  werewolfTargetId: null,
  witchKillTargetId: null,
  witchSaveTargetId: null,
  seerCheckTargetId: null,
  seerCheckHistory: [],
  guardProtectTargetId: null,
  dayVotes: {},
  dayVoteReasons: {},
  previousDayVotes: {},
  previousDayVoteReasons: {},
  lastKilledId: null,
  lastSaved: false,
  lastPoisoned: false,
  tiePlayerIds: [],
  tieSpeakerIndex: -1,
  tieVotes: {},
  nightActions: [],
  _isGeneratingSummary: false,
  hunterShootPending: null,
  lastWordsPlayerId: [],
  mvpPlayerId: null,
  mvpReason: null,
  _mvpSelected: false,
});

const ROLE_NAMES: Record<Role, string> = {
  werewolf: '狼人', villager: '村民', seer: '预言家',
  witch: '女巫', hunter: '猎人', guard: '守卫',
};

function hasRoleAlive(state: GameState, role: Role): boolean {
  return state.players.some(p => p.role === role && p.isAlive);
}

// 日志去重：同 round + phase + message 的日志只保留一条
function dedupeLogs(logs: GameState['logs']): GameState['logs'] {
  const seen = new Set<string>();
  return logs.filter(log => {
    const key = `${log.round}|${log.phase}|${log.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const useGameStore = create<GameStore>((set, get) => ({
  username: '',
  isLoggedIn: false,
  gameState: null,
  selectedPlayerCount: null,

  setUsername: (name) => set({ username: name }),
  login: () => {
    const { username } = get();
    if (username.trim()) set({ isLoggedIn: true });
  },
  logout: () => set({ isLoggedIn: false, username: '', gameState: null, selectedPlayerCount: null }),

  selectPlayerCount: (count) => set({ selectedPlayerCount: count }),

  startGame: () => {
    const { selectedPlayerCount, username } = get();
    const count = selectedPlayerCount || 6;
    const config = getRoleDistribution(count);
    const roles = shuffleRoles(config);
    const aiNames = generateAINames(count - 1);

    let aiIndex = 0;
    const players: Player[] = roles.map((role, i) => {
      if (i === 0) {
        return {
          id: 'player-0', name: username, role, isAI: false, isAlive: true,
          avatarSeed: generateAvatarSeed(),
          hasAntidote: role === 'witch', hasPoison: role === 'witch',
          lastGuardedId: null,
        };
      }
      return {
        id: `player-${i}`, name: aiNames[aiIndex++], role, isAI: true, isAlive: true,
        avatarSeed: generateAvatarSeed(),
        hasAntidote: role === 'witch', hasPoison: role === 'witch',
        lastGuardedId: null,
      };
    });

    set({
      gameState: {
        ...createEmptyState(),
        players,
        phase: 'role-reveal',
        round: 0,
        logs: [{ id: '1', round: 0, phase: 'role-reveal', message: '游戏开始！所有玩家的身份已分配完毕。', timestamp: Date.now() }],
      }
    });
  },

  reshuffleRoles: () => {
    const state = get().gameState;
    if (!state || state.phase !== 'role-reveal') return;
    const count = state.players.length;
    const config = getRoleDistribution(count);
    const roles = shuffleRoles(config);

    const updatedPlayers = state.players.map((p, i) => ({
      ...p,
      role: roles[i],
      hasAntidote: roles[i] === 'witch',
      hasPoison: roles[i] === 'witch',
      isAlive: true,
      lastGuardedId: null as string | null,
    }));

    set({
      gameState: {
        ...state,
        players: updatedPlayers,
        logs: [
          ...state.logs,
          { id: `log-${state.logs.length}`, round: 0, phase: 'role-reveal', message: '玩家重新分配了身份。', timestamp: Date.now() }
        ],
      }
    });
  },

  advancePhase: async () => {
    if (_isAdvancingPhase) return;
    const state = get().gameState;
    if (!state) return;

    // Phase order for night phases
    const phaseOrder: GamePhase[] = [
      'night-werewolf', 'night-seer', 'night-witch', 'night-guard',
      'night-result', 'day-discussion', 'day-vote', 'day-result',
    ];

    // Handle special transitions
    if (state.phase === 'role-reveal') {
      // Start first night
      set({ gameState: { ...state, phase: 'night-werewolf', round: 0 } });
      setTimeout(() => autoSkipPhases(), 400);
      return;
    }

    // tie-speech → day-vote (平票补发言后重新投票，仅非平票玩家可投)
    if (state.phase === 'tie-speech') {
      set({ gameState: { ...state, phase: 'day-vote', dayVotes: {} } });
      setTimeout(() => autoSkipPhases(), 400);
      return;
    }

    if (state.phase === 'day-result') {
      // 立即进入夜晚摘要阶段，不在此等待 LLM 摘要
      const newRound = state.round + 1;
      set({
        gameState: {
          ...state,
          phase: 'night-summary',
          round: newRound,
          werewolfTargetId: null,
          witchKillTargetId: null,
          witchSaveTargetId: null,
          seerCheckTargetId: null,
          guardProtectTargetId: null,
          dayVotes: {},
          dayVoteReasons: {},
          previousDayVotes: {},
          previousDayVoteReasons: {},
          discussionOrder: [],
          currentSpeakerIndex: -1,
          lastKilledId: null,
          lastSaved: false,
          lastPoisoned: false,
          _isGeneratingSummary: true,
        }
      });
      // 自动触发摘要生成（在 autoSkipPhases 中处理）
      setTimeout(() => autoSkipPhases(), 400);
      return;
    }

    // night-summary → night-werewolf（摘要生成完成后由 autoSkipPhases 触发）
    if (state.phase === 'night-summary') {
      set({ gameState: { ...state, phase: 'night-werewolf', _isGeneratingSummary: false } });
      setTimeout(() => autoSkipPhases(), 400);
      return;
    }

    // day-last-words → 弹出当前遗言者，若队列还有则继续遗言，否则进入 day-result
    if (state.phase === 'day-last-words') {
      const queue = [...state.lastWordsPlayerId];
      queue.shift(); // 移除刚发表完遗言的玩家
      if (queue.length > 0) {
        set({ gameState: { ...state, lastWordsPlayerId: queue } });
        setTimeout(() => autoSkipPhases(), 400);
      } else {
        set({ gameState: { ...state, phase: 'day-result', lastWordsPlayerId: [] } });
      }
      return;
    }

    // Normal phase advancement
    const currentIndex = phaseOrder.indexOf(state.phase);
    if (currentIndex < 0) return;

    let nextPhase = currentIndex < phaseOrder.length - 1
      ? phaseOrder[currentIndex + 1]
      : 'night-werewolf';

    // 跳过不存在存活守卫的 night-guard 阶段，防止 processNightResult 被重复调用
    if (nextPhase === 'night-guard' && !hasRoleAlive(state, 'guard')) {
      nextPhase = 'night-result';
    }

    // Process night results when transitioning to day (from the last night phase)
    _isAdvancingPhase = true;
    try {
      if (nextPhase === 'night-result') {
        await processNightResult();
      }
      // 人类猎人暂停选择目标时不继续
      if (get().gameState?.phase === 'hunter-shoot') return;

      // Process day vote when transitioning from day-vote to day-result
      if (state.phase === 'day-vote') {
        await processDayVote();
      }
      // 人类猎人暂停选择目标时不继续
      if (get().gameState?.phase === 'hunter-shoot') return;
    } finally {
      _isAdvancingPhase = false;
    }

    // Check if game is over after processing night results or day vote
    const updatedState = get().gameState;
    if (updatedState?.phase === 'game-over') return;

    // 如果 processDayVote 将阶段设为了 day-last-words（需要遗言），不覆盖
    if (updatedState?.phase === 'day-last-words') return;

    set({ gameState: { ...get().gameState!, phase: nextPhase } });

    // When entering day-discussion, set up speaking order and start
    if (nextPhase === 'day-discussion') {
      setTimeout(() => {
        const s = get().gameState;
        if (s && s.phase === 'day-discussion') {
          // Build speaking order: clockwise starting from killed player, or random start if no kill
          const order = buildDiscussionOrder(s);
          const newState = {
            ...s,
            // 不清空 discussionMessages，保留历史轮次记录供 AI 分析
            discussionOrder: order,
            currentSpeakerIndex: 0,
          };
          set({ gameState: newState });
          // Start the first AI speaker after a short delay
          setTimeout(() => startNextSpeaker(), 800);
        }
      }, 200);
    }

    // Auto skip phases where the role doesn't exist
    setTimeout(() => autoSkipPhases(), 400);
  },

  selectWerewolfTarget: async (playerId) => {
    const state = get().gameState;
    if (!state || state.phase !== 'night-werewolf') return;

    // 人类玩家选择了目标，先记录人类的一票
    const userPlayer = state.players.find(p => !p.isAI);
    if (!userPlayer) return;

    // 找到所有其他存活的 AI 狼人
    const aiWerewolves = state.players.filter(
      p => p.role === 'werewolf' && p.isAlive && p.isAI
    );

    // 如果没有其他 AI 狼人，直接用人类的选择
    if (aiWerewolves.length === 0) {
      set({ gameState: { ...state, werewolfTargetId: playerId } });
      setTimeout(() => get().advancePhase(), 800);
      return;
    }

    // 先设置人类的目标作为占位（让 UI 显示等待状态）
    const waitingState = { ...state, werewolfTargetId: playerId };
    set({ gameState: waitingState });

    // 并行调用所有 AI 狼人投票
    const votes: Map<string, number> = new Map(); // targetId -> count
    const wolfVotes: Map<string, string> = new Map(); // wolfId -> targetId (for logging)
    // 人类的一票
    votes.set(playerId, 1);
    wolfVotes.set(userPlayer.id, playerId);

    // 让 AI 狼人各自投票
    if (isAIConfigured()) {
      const results = await Promise.allSettled(
        aiWerewolves.map(async (wolf) => {
          const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: buildRoleSystemPrompt('werewolf', wolf.name, state) },
            { role: 'user', content: buildWerewolfNightVoteContext(state, wolf, userPlayer.name, playerId) },
          ];
          const response = await callLLM(messages);
          return { wolfId: wolf.id, response };
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.response) {
          const targetName = extractPlayerName(result.value.response, state);
          if (targetName) {
            const targetId = findPlayerIdByName(targetName, state);
            if (targetId) {
              votes.set(targetId, (votes.get(targetId) || 0) + 1);
              wolfVotes.set(result.value.wolfId, targetId);
            }
          }
        }
      }
    } else {
      // 无 API 时，AI 狼人随机投票（可自刀）
      const alivePlayers = state.players.filter(p => p.isAlive);
      for (const wolf of aiWerewolves) {
        const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        votes.set(randomTarget.id, (votes.get(randomTarget.id) || 0) + 1);
        wolfVotes.set(wolf.id, randomTarget.id);
      }
    }

    // 统计票数，选最高的
    let maxVotes = 0;
    let finalTargetId: string | null = null;
    const tiedIds: string[] = [];
    for (const [id, count] of votes) {
      if (count > maxVotes) {
        maxVotes = count;
        finalTargetId = id;
        tiedIds.length = 0;
        tiedIds.push(id);
      } else if (count === maxVotes) {
        tiedIds.push(id);
      }
    }
    if (tiedIds.length > 1) {
      finalTargetId = tiedIds[Math.floor(Math.random() * tiedIds.length)];
    }

    // 记录投票日志
    const currentState = get().gameState;
    if (currentState && currentState.phase === 'night-werewolf') {
      const finalTarget = currentState.players.find(p => p.id === finalTargetId);
      // 构建投票详情：人类玩家 + AI狼人
      const humanTargetName = currentState.players.find(p => p.id === playerId)?.name || '?';
      const voteDetails = [`${userPlayer.name}→${humanTargetName}`];
      // 记录每个 AI 狼人的投票
      for (const wolf of aiWerewolves) {
        const aiVoteTargetId = wolfVotes.get(wolf.id);
        const aiTargetName = aiVoteTargetId
          ? currentState.players.find(p => p.id === aiVoteTargetId)?.name || '?'
          : '弃票';
        voteDetails.push(`${wolf.name}→${aiTargetName}`);
      }

      const newLogs = dedupeLogs([...currentState.logs, {
        id: `log-${currentState.logs.length}`,
        round: currentState.round,
        phase: 'night-werewolf' as const,
        message: `狼人投票：${voteDetails.join('，')}。最终目标：${finalTarget?.name || '?'}`,
        timestamp: Date.now(),
      }]);

      set({
        gameState: {
          ...currentState,
          werewolfTargetId: finalTargetId,
          logs: newLogs,
        }
      });
    }

    setTimeout(() => get().advancePhase(), 1000);
  },

  selectSeerTarget: (playerId) => {
    const state = get().gameState;
    if (!state || state.phase !== 'night-seer') return;
    // 只设置目标，不自动推进，让玩家看完结果后手动确认
    const target = state.players.find(p => p.id === playerId);
    const isWerewolf = target?.role === 'werewolf';
    const newLogs = dedupeLogs([...state.logs, {
      id: `log-${state.logs.length}`,
      round: state.round,
      phase: 'night-seer' as const,
      message: `🔮 预言家查验了 ${target?.name}，结果是：${isWerewolf ? '狼人' : '好人'}`,
      timestamp: Date.now(),
    }]);
    set({ gameState: {
      ...state,
      seerCheckTargetId: playerId,
      seerCheckHistory: [...state.seerCheckHistory, { round: state.round, targetId: playerId, isWerewolf: !!isWerewolf }],
      logs: newLogs,
    } });
  },

  witchUseAntidote: (use) => {
    const state = get().gameState;
    if (!state || state.phase !== 'night-witch') return;
    set({
      gameState: {
        ...state,
        witchSaveTargetId: use ? state.werewolfTargetId : null,
      }
    });
  },

  witchUsePoison: (playerId) => {
    const state = get().gameState;
    if (!state || state.phase !== 'night-witch') return;
    set({ gameState: { ...state, witchKillTargetId: playerId } });
    setTimeout(() => get().advancePhase(), 800);
  },

  selectGuardTarget: (playerId) => {
    const state = get().gameState;
    if (!state || state.phase !== 'night-guard') return;
    set({ gameState: { ...state, guardProtectTargetId: playerId } });
    setTimeout(() => get().advancePhase(), 800);
  },

  selectHunterTarget: (targetId) => {
    const state = get().gameState;
    if (!state || state.phase !== 'hunter-shoot') return;
    const pending = state.hunterShootPending;
    if (!pending) return;
    
    const { hunterId, returnPhase, updatedPlayers, logs, nightActions, previousDayVotes, previousDayVoteReasons } = pending;
    const hunter = updatedPlayers.find(p => p.id === hunterId);
    const target = updatedPlayers.find(p => p.id === targetId);
    if (!hunter || !target || !target.isAlive) return;
    
    // 猎人开枪（白天放逐→暴露猎人身份；夜晚死亡→不暴露，只记录死亡）
    target.isAlive = false;
    const isNightDeath = returnPhase === 'night-result';
    logs.push({
      id: `log-${logs.length}`,
      round: state.round,
      phase: returnPhase,
      message: isNightDeath
        ? `${target.name} 死了。`
        : `${hunter.name}（猎人）在临死前开枪带走了 ${target.name}！`,
      timestamp: Date.now(),
    });
    
    set({
      gameState: {
        ...state,
        players: updatedPlayers,
        logs: dedupeLogs(logs),
        phase: returnPhase,
        lastWordsPlayerId: isNightDeath ? state.lastWordsPlayerId : [...state.lastWordsPlayerId, targetId],
        dayVotes: {},
        dayVoteReasons: {},
        previousDayVotes,
        previousDayVoteReasons,
        tiePlayerIds: [],
        tieSpeakerIndex: -1,
        tieVotes: {},
        hunterShootPending: null,
      }
    });
    
    // 猎人射击后触发自动推进（遗言→autoSkipPhases处理遗言，夜晚→autoSkipPhases处理night-result展示）
    if (returnPhase === 'day-last-words' || returnPhase === 'night-result') {
      setTimeout(() => autoSkipPhases(), 400);
    }

    // Check game over
    setTimeout(() => {
      const currentState = get().gameState;
      if (!currentState) return;
      const gameOverResult = checkGameOver(currentState.players);
      if (gameOverResult) {
        transitionToGameOver(gameOverResult);
      }
    }, 100);
  },

  castVote: (targetId) => {
    const state = get().gameState;
    if (!state || state.phase !== 'day-vote') return;
    const userPlayer = state.players.find(p => !p.isAI);
    if (!userPlayer || !userPlayer.isAlive) return;
    // 不能投自己
    if (targetId === userPlayer.id) return;

    const newVotes = { ...state.dayVotes, [userPlayer.id]: targetId };
    set({ gameState: { ...state, dayVotes: newVotes } });

    setTimeout(() => {
      processAIVotes();
    }, 500);
  },

  castTieVote: (targetId) => {
    const state = get().gameState;
    if (!state || state.phase !== 'day-vote') return;
    const userPlayer = state.players.find(p => !p.isAI);
    if (!userPlayer || !userPlayer.isAlive) return;
    // 平票玩家不能投票
    if (state.tiePlayerIds.includes(userPlayer.id)) return;
    // 不能投自己
    if (targetId === userPlayer.id) return;
    // 只能投给平票玩家
    if (targetId !== 'skip' && !state.tiePlayerIds.includes(targetId)) return;

    const newVotes = { ...state.dayVotes, [userPlayer.id]: targetId };
    set({ gameState: { ...state, dayVotes: newVotes } });

    setTimeout(() => {
      processAIVotes();
    }, 500);
  },

  sendDiscussionMessage: (content) => {
    const state = get().gameState;
    if (!state || state.phase !== 'day-discussion') return;
    const userPlayer = state.players.find(p => !p.isAI);
    if (!userPlayer || !userPlayer.isAlive) return;

    // Only allow speaking when it's the user's turn
    if (state.discussionOrder[state.currentSpeakerIndex] !== userPlayer.id) {
      return; // Not your turn
    }

    const newMsg = {
      id: `msg-${Date.now()}`,
      playerId: userPlayer.id,
      playerName: userPlayer.name,
      content,
      round: state.round,
      timestamp: Date.now(),
    };

    const newMessages = [...state.discussionMessages, newMsg];
    const nextIndex = state.currentSpeakerIndex + 1;
    set({
      gameState: {
        ...state,
        discussionMessages: newMessages,
        currentSpeakerIndex: nextIndex,
      }
    });

    // Move to next speaker
    setTimeout(() => startNextSpeaker(), 800);
  },

  generateAIDiscussion: async () => {
    // This is now called by startNextSpeaker for each individual AI
    const state = get().gameState;
    if (!state || state.phase !== 'day-discussion') return;

    const currentIdx = state.currentSpeakerIndex;
    const order = state.discussionOrder;
    if (currentIdx < 0 || currentIdx >= order.length) return;

    const speakerId = order[currentIdx];
    const speaker = state.players.find(p => p.id === speakerId);
    if (!speaker || !speaker.isAlive || !speaker.isAI) return;

    // Generate AI speech
    let msg: string | null = null;
    try {
      msg = await aiGenerateDiscussion(state, speaker);
    } catch {
      msg = getFallbackSpeech(speaker);
    }

    const currentState = get().gameState;
    if (!currentState || currentState.phase !== 'day-discussion') return;
    if (currentState.currentSpeakerIndex !== currentIdx) return; // State changed

    const newMsg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      playerId: speaker.id,
      playerName: speaker.name,
      content: msg || getFallbackSpeech(speaker),
      round: currentState.round,
      timestamp: Date.now(),
    };

    const newMessages = [...currentState.discussionMessages, newMsg];
    const nextIndex = currentIdx + 1;
    set({
      gameState: {
        ...currentState,
        discussionMessages: newMessages,
        currentSpeakerIndex: nextIndex,
      }
    });

    // Move to next speaker
    setTimeout(() => startNextSpeaker(), 1200 + Math.random() * 1000);
  },

  continueTieSpeakers: () => {
    processTieSpeakers();
  },

  resetGame: () => set({ gameState: null, selectedPlayerCount: null }),
  restartGame: () => set({ gameState: null }),
}));

// ============ Helper Functions ============

// 记录已处理夜晚结果的轮次，防止同一轮 processNightResult 被重复调用
let _nightResultProcessedRound = -1;
// 防止女巫 AI 决策被重复触发（记录已决策的轮次）
let _witchDecidedRound = -1;
// 防止 advancePhase 异步重入
let _isAdvancingPhase = false;

/**
 * 统一过渡到游戏结束阶段，并触发 MVP 评选
 */
function transitionToGameOver(gameOverResult: 'werewolf-win' | 'villager-win') {
  const state = useGameStore.getState().gameState;
  if (!state || state.phase === 'game-over') return;

  useGameStore.setState({
    gameState: { ...state, phase: 'game-over', gameResult: gameOverResult }
  });

  // 异步触发 MVP 评选
  setTimeout(async () => {
    const s = useGameStore.getState().gameState;
    if (!s || s._mvpSelected) return;
    
    useGameStore.setState({ gameState: { ...s, _mvpSelected: true } });
    
    const mvp = await aiSelectMVP(s);
    const current = useGameStore.getState().gameState;
    if (mvp && current && current.phase === 'game-over') {
      useGameStore.setState({
        gameState: {
          ...current,
          mvpPlayerId: mvp.playerId,
          mvpReason: mvp.reason,
        }
      });
    }
  }, 500);
}

/**
 * 异步处理 AI 猎人开枪
 * @returns { messages: 日志消息, shotIds: 被开枪杀死的玩家ID列表 }
 */
async function resolveHunterShoots(
  state: GameState,
  hunterDeadIds: string[],
  updatedPlayers: Player[],
  isNightDeath: boolean = false,
): Promise<{ messages: string[]; shotIds: string[] }> {
  const messages: string[] = [];
  const shotIds: string[] = [];
  for (const deadId of hunterDeadIds) {
    const deadPlayer = updatedPlayers.find(p => p.id === deadId);
    if (!deadPlayer || deadPlayer.role !== 'hunter') continue;
    // 人类玩家猎人 → 由 UI 选择，此处跳过
    if (!deadPlayer.isAI) continue;
    
    const aliveOthers = updatedPlayers.filter(p => p.isAlive && p.id !== deadId);
    if (aliveOthers.length === 0) continue;

    const shotId = await aiHunterChooseTarget(state, deadId);
    const shot = shotId ? updatedPlayers.find(p => p.id === shotId) : null;
    if (!shot || !shot.isAlive) {
      const fallback = aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
      fallback.isAlive = false;
      shotIds.push(fallback.id);
      if (isNightDeath) {
        messages.push(`昨晚，${fallback.name} 死了。`);
      } else {
        messages.push(`${deadPlayer.name}（猎人）在临死前开枪带走了 ${fallback.name}！`);
      }
    } else {
      shot.isAlive = false;
      shotIds.push(shot.id);
      if (isNightDeath) {
        messages.push(`昨晚，${shot.name} 死了。`);
      } else {
        messages.push(`${deadPlayer.name}（猎人）在临死前开枪带走了 ${shot.name}！`);
      }
    }
  }
  return { messages, shotIds };
}

async function processNightResult() {
  const state = useGameStore.getState().gameState;
  if (!state) return;
  // 防止在非夜间阶段被重复调用
  if (state.phase !== 'night-guard' && state.phase !== 'night-witch') return;
  // 防止同一轮内重复执行
  if (_nightResultProcessedRound === state.round) return;
  _nightResultProcessedRound = state.round;

  const updatedPlayers = state.players.map(p => ({ ...p }));
  const logs = [...state.logs];
  let killedId: string | null = null;
  let witchSavedSomeone = false; // 女巫是否使用了解药救人（区别于守卫守护）
  let guardSavedSomeone = false; // 守卫是否成功守护
  let poisoned = false;

  // 记录所有本回合死亡玩家的 ID（后续用于检查猎人开枪）
  const newlyDeadIds: string[] = [];

  // Werewolf kill
  if (state.werewolfTargetId) {
    const guarded = state.guardProtectTargetId === state.werewolfTargetId;
    const witchSaved = state.witchSaveTargetId === state.werewolfTargetId;

    // 同守同救：守卫和女巫同时保护同一人，保护失效，目标死亡，女巫解药消耗
    if (guarded && witchSaved) {
      const target = updatedPlayers.find(p => p.id === state.werewolfTargetId);
      if (target) {
        target.isAlive = false;
        killedId = target.id;
        newlyDeadIds.push(target.id);
      }
      const witch = updatedPlayers.find(p => p.role === 'witch');
      if (witch) witch.hasAntidote = false;
      logs.push({
        id: `log-${logs.length}`,
        round: state.round,
        phase: 'night-result',
        message: `昨晚，${target?.name || '一名玩家'} 死了。`,
        timestamp: Date.now(),
      });
    } else if (guarded) {
      guardSavedSomeone = true;
      logs.push({
        id: `log-${logs.length}`,
        round: state.round,
        phase: 'night-result',
        message: '昨晚是平安夜，无人死亡。',
        timestamp: Date.now(),
      });
    } else if (witchSaved) {
      witchSavedSomeone = true;
      const witch = updatedPlayers.find(p => p.role === 'witch');
      if (witch) witch.hasAntidote = false;
      logs.push({
        id: `log-${logs.length}`,
        round: state.round,
        phase: 'night-result',
        message: '昨晚是平安夜，无人死亡。',
        timestamp: Date.now(),
      });
    } else {
      const target = updatedPlayers.find(p => p.id === state.werewolfTargetId);
      if (target) {
        target.isAlive = false;
        killedId = target.id;
        newlyDeadIds.push(target.id);
        logs.push({
          id: `log-${logs.length}`,
          round: state.round,
          phase: 'night-result',
          message: `昨晚，${target.name} 死了。`,
          timestamp: Date.now(),
        });
      }
    }
  }

  // Witch poison
  if (state.witchKillTargetId) {
    const target = updatedPlayers.find(p => p.id === state.witchKillTargetId);
    if (target && target.isAlive) {
      target.isAlive = false;
      poisoned = true;
      newlyDeadIds.push(target.id);
      logs.push({
        id: `log-${logs.length}`,
        round: state.round,
        phase: 'night-result',
        message: `昨晚，${target.name} 死了。`,
        timestamp: Date.now(),
      });
    }
    const witch = updatedPlayers.find(p => p.role === 'witch');
    if (witch) witch.hasPoison = false;
  }

  // 猎人死亡时开枪带走一名存活玩家（AI 猎人→大模型决策，人类猎人→进入选择 UI）
  const hunterDeadIds: string[] = [];
  let humanHunterId: string | null = null;
  for (const deadId of newlyDeadIds) {
    const deadPlayer = updatedPlayers.find(p => p.id === deadId);
    if (!deadPlayer || deadPlayer.role !== 'hunter') continue;
    if (!deadPlayer.isAI) {
      humanHunterId = deadId;
    } else {
      hunterDeadIds.push(deadId);
    }
  }
  
  // 人类玩家猎人死亡 → 暂停游戏，让玩家选择开枪目标
  if (humanHunterId) {
    // 先记录现场状态
    useGameStore.setState({
      gameState: {
        ...state,
        players: updatedPlayers,
        logs,
        phase: 'hunter-shoot',
        hunterShootPending: {
          hunterId: humanHunterId,
          returnPhase: 'night-result',
          updatedPlayers,
          logs,
          nightActions: [...(state.nightActions || [])],
          previousDayVotes: { ...state.previousDayVotes },
          previousDayVoteReasons: { ...state.previousDayVoteReasons },
        },
      }
    });
    return;
  }
  
  // AI 猎人开枪（夜晚死亡，不暴露猎人身份）
  if (hunterDeadIds.length > 0) {
    const { messages: hunterMessages } = await resolveHunterShoots(state, hunterDeadIds, updatedPlayers, true);
    for (const msg of hunterMessages) {
      logs.push({
        id: `log-${logs.length}`,
        round: state.round,
        phase: 'night-result',
        message: msg,
        timestamp: Date.now(),
      });
    }
  }

  // Update guard lastGuarded
  if (state.guardProtectTargetId) {
    const guard = updatedPlayers.find(p => p.role === 'guard');
    if (guard) guard.lastGuardedId = state.guardProtectTargetId;
  }

  // 记录夜晚行动（上帝视角）
  const nightActions = [...(state.nightActions || [])];
  const r = state.round;

  // 狼人行动
  if (state.werewolfTargetId) {
    const target = state.players.find(p => p.id === state.werewolfTargetId);
    const wolves = state.players.filter(p => p.role === 'werewolf' && p.isAlive);
    for (const w of wolves) {
      nightActions.push({ round: r, phase: 'night-werewolf', actorId: w.id, actorName: w.name, actorRole: 'werewolf', action: '狼人刀人', targetId: state.werewolfTargetId, targetName: target?.name || '未知' });
    }
  }
  // 预言家行动
  if (state.seerCheckTargetId) {
    const seer = state.players.find(p => p.role === 'seer');
    const target = state.players.find(p => p.id === state.seerCheckTargetId);
    if (seer) {
      nightActions.push({ round: r, phase: 'night-seer', actorId: seer.id, actorName: seer.name, actorRole: 'seer', action: `预言家查验（${target?.role === 'werewolf' ? '狼人' : '好人'}）`, targetId: state.seerCheckTargetId, targetName: target?.name || '未知' });
    }
  }
  // 女巫行动（仅当女巫真正使用了药水时才记录）
  if (witchSavedSomeone) {
    const witch = state.players.find(p => p.role === 'witch');
    const target = state.players.find(p => p.id === state.werewolfTargetId);
    if (witch) {
      nightActions.push({ round: r, phase: 'night-witch', actorId: witch.id, actorName: witch.name, actorRole: 'witch', action: '使用解药救人', targetId: state.werewolfTargetId, targetName: target?.name || '未知' });
    }
  }
  if (poisoned && state.witchKillTargetId) {
    const witch = state.players.find(p => p.role === 'witch');
    const target = state.players.find(p => p.id === state.witchKillTargetId);
    if (witch) {
      nightActions.push({ round: r, phase: 'night-witch', actorId: witch.id, actorName: witch.name, actorRole: 'witch', action: '使用毒药毒杀', targetId: state.witchKillTargetId, targetName: target?.name || '未知' });
    }
  }
  // 守卫行动（无论是否成功守护，都记录守护动作）
  if (state.guardProtectTargetId) {
    const guard = state.players.find(p => p.role === 'guard');
    const target = state.players.find(p => p.id === state.guardProtectTargetId);
    if (guard) {
      const actionLabel = guardSavedSomeone ? '守卫守护（成功）' : '守卫守护';
      nightActions.push({ round: r, phase: 'night-guard', actorId: guard.id, actorName: guard.name, actorRole: 'guard', action: actionLabel, targetId: state.guardProtectTargetId, targetName: target?.name || '未知' });
    }
  }

  // 先更新玩家状态
  useGameStore.setState({
    gameState: {
      ...state,
      players: updatedPlayers,
      logs: dedupeLogs(logs),
      lastKilledId: killedId,
      lastSaved: witchSavedSomeone,
      lastPoisoned: poisoned,
      nightActions,
    }
  });

  // 夜晚结果处理完后立即检查游戏是否结束（如所有狼人死亡等）
  const gameOverResult = checkGameOver(updatedPlayers);
  if (gameOverResult) {
    transitionToGameOver(gameOverResult);
  }
}

async function processAIVotes() {
  const state = useGameStore.getState().gameState;
  if (!state || state.phase !== 'day-vote') return;

  const votes: Record<string, string> = { ...state.dayVotes };
  const reasons: Record<string, string> = { ...state.dayVoteReasons };
  const aliveAI = state.players.filter(p => p.isAI && p.isAlive && !votes[p.id]);
  const isTieVote = state.tiePlayerIds.length > 0;

  // 并行调用所有 AI 玩家投票（平票补投使用专用上下文）
  const voteResults = await Promise.allSettled(
    aliveAI.map(async (ai) => {
      const result = isTieVote
        ? await aiTieVote(state, ai)
        : await aiVote(state, ai);
      return { voterId: ai.id, targetId: result.targetId, reason: result.reason };
    })
  );

  // 收集投票结果和理由
  const tieVoterIds = new Set(state.tiePlayerIds);

  for (const result of voteResults) {
    if (result.status === 'fulfilled' && result.value.targetId) {
      const { voterId, targetId, reason } = result.value;
      // 保存投票理由
      if (reason) {
        reasons[voterId] = reason;
      }
      // 平票玩家不能投票
      if (isTieVote && tieVoterIds.has(voterId)) continue;
      // 不能投自己
      if (targetId === voterId) continue;
      // 处理弃票
      if (targetId === 'skip') {
        if (!isTieVote) { // 平票补投不允许弃票
          votes[voterId] = 'skip';
        }
        continue;
      }
      // 平票补投：只能投给平票玩家
      if (isTieVote && !tieVoterIds.has(targetId)) continue;
      const voter = state.players.find(p => p.id === voterId);
      const target = state.players.find(p => p.id === targetId);
      if (voter && target) {
        votes[voterId] = targetId;
      }
    }
  }

  // 确保所有 AI 都有投票（处理失败或 API 调用异常的）
  // 平票补投阶段，排除平票玩家自己
  const aiToFill = aliveAI.filter(ai => !votes[ai.id] && (!isTieVote || !tieVoterIds.has(ai.id)));
  for (const ai of aiToFill) {
    let candidates: Player[];
    if (isTieVote) {
      // 只能投平票玩家
      candidates = state.players.filter(p => p.isAlive && p.id !== ai.id && tieVoterIds.has(p.id));
    } else {
      candidates = state.players.filter(p => p.isAlive && p.id !== ai.id);
    }
    if (candidates.length > 0) {
      votes[ai.id] = candidates[Math.floor(Math.random() * candidates.length)].id;
    }
  }

  const currentState = useGameStore.getState().gameState;
  if (currentState) {
    useGameStore.setState({ gameState: { ...currentState, dayVotes: votes, dayVoteReasons: reasons } });
  }

  // Process vote result
  setTimeout(() => {
    processDayVote();
  }, 1200);
}

async function processDayVote() {
  const state = useGameStore.getState().gameState;
  if (!state) return;
  if (state.phase !== 'day-vote') return; // 防止重复调用，只在投票阶段处理

  const voteCount: Record<string, number> = {};
  const aliveIds = new Set(state.players.filter(p => p.isAlive).map(p => p.id));

  // 检查是否是平票补投阶段
  const isTieReVote = state.tiePlayerIds.length > 0;
  const tieVoterIds = new Set(state.tiePlayerIds);

  Object.entries(state.dayVotes).forEach(([voterId, targetId]) => {
    // 平票补投阶段：平票玩家不能投票
    if (isTieReVote && tieVoterIds.has(voterId)) return;
    // 不能投自己
    if (targetId === voterId) return;
    // 平票补投阶段：只能投给平票玩家
    if (isTieReVote && targetId !== 'skip' && !tieVoterIds.has(targetId)) return;

    if (targetId !== 'skip' && aliveIds.has(targetId)) {
      voteCount[targetId] = (voteCount[targetId] || 0) + 1;
    }
  });

  let maxVotes = 0;
  let exiledId: string | null = null;
  let tie = false;
  const topCandidates: string[] = [];

  Object.entries(voteCount).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      exiledId = id;
      tie = false;
      topCandidates.length = 0;
      topCandidates.push(id);
    } else if (count === maxVotes && count > 0) {
      tie = true;
      topCandidates.push(id);
    }
  });

  // 首次投票平票 → 进入平票补发言阶段
  if (tie && !isTieReVote && topCandidates.length >= 2) {
    const tiedIds = topCandidates;
    const updatedState = {
      ...state,
      phase: 'tie-speech' as GamePhase,
      tiePlayerIds: tiedIds,
      tieSpeakerIndex: 0,
      previousDayVotes: { ...state.dayVotes },
      previousDayVoteReasons: { ...state.dayVoteReasons },
      dayVotes: {},
      dayVoteReasons: {},
    };
    // 记录平票日志
    const tiedNames = tiedIds.map(id => state.players.find(p => p.id === id)?.name || '未知').join('、');
    const logs = [...state.logs, {
      id: `log-${state.logs.length}`,
      round: state.round,
      phase: 'day-result',
      message: `⚖️ 投票平票！${tiedNames} 将进行补充发言，之后由其他玩家重新投票。`,
      timestamp: Date.now(),
    }];
    useGameStore.setState({ gameState: { ...updatedState, logs: dedupeLogs(logs) } });
    setTimeout(() => startTieSpeaker(), 1000);
    return;
  }

  // 平票补投后仍然平票 → 随机放逐一人在平票玩家中
  if (isTieReVote && (tie || !exiledId)) {
    if (topCandidates.length >= 2) {
      exiledId = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    } else if (topCandidates.length === 1) {
      exiledId = topCandidates[0];
    } else {
      // 极端情况：所有平票玩家都死了或无人被投票
      const aliveTied = state.tiePlayerIds.filter(id => aliveIds.has(id));
      if (aliveTied.length > 0) {
        exiledId = aliveTied[Math.floor(Math.random() * aliveTied.length)];
      }
    }
  }

  const updatedPlayers = state.players.map(p => ({ ...p }));
  const logs = [...state.logs];

  // 生成投票详情日志
  const voteDetails: string[] = [];
  const playerMap = new Map(state.players.map(p => [p.id, p]));
  for (const [voterId, targetId] of Object.entries(state.dayVotes)) {
    if (isTieReVote && tieVoterIds.has(voterId)) continue; // 平票玩家未参与投票
    const voter = playerMap.get(voterId);
    if (!voter) continue;
    const voterName = voter.name.replace(/\(你\)$/, '');
    if (targetId === 'skip') {
      voteDetails.push(`${voterName}→弃票`);
    } else {
      const target = playerMap.get(targetId);
      const targetName = target ? target.name.replace(/\(你\)$/, '') : '未知';
      voteDetails.push(`${voterName}→${targetName}`);
    }
  }

  if (voteDetails.length > 0) {
    logs.push({
      id: `log-${logs.length}`,
      round: state.round,
      phase: 'day-result',
      message: `📊 投票详情：${voteDetails.join('，')}`,
      timestamp: Date.now(),
    });
  }

  // AI猎人白天开枪的目标（需加入遗言队列）
  let hunterShotIds: string[] = [];

  if (exiledId) {
    const exiled = updatedPlayers.find(p => p.id === exiledId);
    if (exiled && exiled.isAlive) {
      exiled.isAlive = false;
      const isRandomExile = isTieReVote && (tie || topCandidates.length >= 2);

      if (exiled.role === 'hunter') {
        logs.push({
          id: `log-${logs.length}`, round: state.round, phase: 'day-result',
          message: isRandomExile
            ? `🎲 补投后仍平票，随机放逐 ${exiled.name}，身份是 ${ROLE_NAMES[exiled.role]}。`
            : `${exiled.name} 被投票放逐（${maxVotes}票），身份是 ${ROLE_NAMES[exiled.role]}。`,
          timestamp: Date.now(),
        });
        
        // 人类猎人 → 暂停游戏，让玩家选择开枪目标
        if (!exiled.isAI) {
          useGameStore.setState({
            gameState: {
              ...state,
              players: updatedPlayers,
              logs,
              phase: 'hunter-shoot',
              lastWordsPlayerId: [exiledId],
              hunterShootPending: {
                hunterId: exiledId,
                returnPhase: 'day-last-words',
                updatedPlayers,
                logs,
                nightActions: [...(state.nightActions || [])],
                previousDayVotes: { ...state.previousDayVotes },
                previousDayVoteReasons: { ...state.previousDayVoteReasons },
              },
            }
          });
          return;
        }
        
        // AI 猎人开枪（白天被投出，暴露猎人身份，被带走者需发表遗言）
        const { messages: aiHunterMsgs, shotIds: aiHunterShotIds } = await resolveHunterShoots(state, [exiledId], updatedPlayers);
        for (const msg of aiHunterMsgs) {
          logs.push({
            id: `log-${logs.length}`, round: state.round, phase: 'day-result',
            message: msg,
            timestamp: Date.now(),
          });
        }
        // AI猎人开枪目标加入遗言队列
        aiHunterShotIds.forEach(id => hunterShotIds.push(id));
      } else {
        logs.push({
          id: `log-${logs.length}`, round: state.round, phase: 'day-result',
          message: isRandomExile
            ? `🎲 补投后仍平票，随机放逐 ${exiled.name}。`
            : `${exiled.name} 被投票放逐（${maxVotes}票）。`,
          timestamp: Date.now(),
        });
      }
    }
  } else {
    logs.push({
      id: `log-${logs.length}`, round: state.round, phase: 'day-result',
      message: isTieReVote ? '补投后仍平票，无人被放逐。' : '投票平票或无人被投，无人被放逐。',
      timestamp: Date.now(),
    });
  }

  const previousDayVotes = { ...state.dayVotes };
  const previousDayVoteReasons = { ...state.dayVoteReasons };

  useGameStore.setState({
    gameState: {
      ...state,
      players: updatedPlayers,
      logs: dedupeLogs(logs),
      phase: exiledId ? 'day-last-words' : 'day-result',
      lastWordsPlayerId: exiledId ? [exiledId, ...hunterShotIds] : [],
      dayVotes: {},
      dayVoteReasons: {},
      previousDayVotes,
      previousDayVoteReasons,
      tiePlayerIds: [],
      tieSpeakerIndex: -1,
      tieVotes: {},
    }
  });

  // Check game over
  const gameOverResult = checkGameOver(updatedPlayers);
  if (gameOverResult) {
    transitionToGameOver(gameOverResult);
  }

  // 进入遗言阶段后触发 autoSkipPhases 处理 AI 遗言生成
  if (exiledId) {
    setTimeout(() => autoSkipPhases(), 400);
  }
}

async function processAINightActions() {
  const state = useGameStore.getState().gameState;
  if (!state) return;

  // AI werewolves pick target (async - calls LLM)
  if (state.phase === 'night-werewolf') {
    const aliveWerewolves = state.players.filter(p => p.role === 'werewolf' && p.isAlive && p.isAI);
    const alivePlayers = state.players.filter(p => p.isAlive);

    if (aliveWerewolves.length > 0 && alivePlayers.length > 0 && !state.werewolfTargetId) {
      // 使用 LLM API 选择目标
      let targetId = await aiWerewolfChooseTarget(state);
      // 狼人不能空刀，如果 AI 没返回结果，随机选一个存活玩家
      if (!targetId && alivePlayers.length > 0) {
        targetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
      }
      if (targetId) {
        const currentState = useGameStore.getState().gameState;
        if (currentState) {
          useGameStore.setState({ gameState: { ...currentState, werewolfTargetId: targetId } });
        }
      }
      setTimeout(() => useGameStore.getState().advancePhase(), 600);
      return;
    }
  }

  // AI seer checks (async - calls LLM)
  if (state.phase === 'night-seer') {
    const seer = state.players.find(p => p.role === 'seer' && p.isAlive && p.isAI);
    if (seer && !state.seerCheckTargetId) {
      const targetId = await aiSeerChooseTarget(state);
      if (targetId) {
        const currentState = useGameStore.getState().gameState;
        if (currentState) {
          const target = currentState.players.find(p => p.id === targetId);
          const isWerewolf = target?.role === 'werewolf';
          const newLogs = dedupeLogs([...currentState.logs, {
            id: `log-${currentState.logs.length}`,
            round: currentState.round,
            phase: 'night-seer' as const,
            message: `🔮 预言家查验了 ${target?.name || '未知'}，结果是：${isWerewolf ? '狼人' : '好人'}`,
            timestamp: Date.now(),
          }]);
          useGameStore.setState({
            gameState: {
              ...currentState,
              seerCheckTargetId: targetId,
              seerCheckHistory: [...currentState.seerCheckHistory, { round: currentState.round, targetId, isWerewolf: !!isWerewolf }],
              logs: newLogs,
            }
          });
        }
      }
      setTimeout(() => useGameStore.getState().advancePhase(), 600);
      return;
    }
  }

  // AI witch (async - calls LLM)
  if (state.phase === 'night-witch') {
    const witch = state.players.find(p => p.role === 'witch' && p.isAlive && p.isAI);
    // 防重入：同一轮内女巫只决策一次
    if (witch && _witchDecidedRound !== state.round) {
      _witchDecidedRound = state.round;
      const decision = await aiWitchDecide(state);
      const currentState = useGameStore.getState().gameState;
      if (currentState) {
        useGameStore.setState({
          gameState: {
            ...currentState,
            witchSaveTargetId: decision.useAntidote ? currentState.werewolfTargetId : null,
            witchKillTargetId: decision.poisonTargetId,
          }
        });
      }
      setTimeout(() => useGameStore.getState().advancePhase(), 600);
      return;
    }
    // 女巫已决策或正在决策中，不要 fallthrough 到 auto-advance
    if (witch) {
      return;
    }
  }

  // AI guard (async - calls LLM)
  if (state.phase === 'night-guard') {
    const guard = state.players.find(p => p.role === 'guard' && p.isAlive && p.isAI);
    if (guard && !state.guardProtectTargetId) {
      const targetId = await aiGuardChooseTarget(state);
      if (targetId) {
        const currentState = useGameStore.getState().gameState;
        if (currentState) {
          useGameStore.setState({
            gameState: {
              ...currentState,
              guardProtectTargetId: targetId,
            }
          });
        }
      }
      setTimeout(() => useGameStore.getState().advancePhase(), 600);
      return;
    }
  }

  // If we're still here (no AI action needed), advance
  setTimeout(() => useGameStore.getState().advancePhase(), 400);
}

function autoSkipPhases() {
  const state = useGameStore.getState().gameState;
  if (!state) return;

  // night-summary: 生成轮次摘要（在狼人行动前，后台执行）
  if (state.phase === 'night-summary') {
    if (state._isGeneratingSummary) {
      const finishingRound = state.round - 1; // 刚结束的轮次
      generateRoundSummary(state, finishingRound).then(summary => {
        const s = useGameStore.getState().gameState;
        if (s && s.phase === 'night-summary') {
          useGameStore.setState({
            gameState: {
              ...s,
              roundSummaries: [...s.roundSummaries, { round: finishingRound, summary }],
            }
          });
          useGameStore.getState().advancePhase();
        }
      }).catch(() => {
        const fallbackSummary = generateFallbackSummary(state, finishingRound);
        const s = useGameStore.getState().gameState;
        if (s && s.phase === 'night-summary') {
          useGameStore.setState({
            gameState: {
              ...s,
              roundSummaries: [...s.roundSummaries, { round: finishingRound, summary: fallbackSummary }],
            }
          });
          useGameStore.getState().advancePhase();
        }
      });
    }
    return;
  }

  // tie-speech: handle AI tie speakers
  if (state.phase === 'tie-speech') {
    processTieSpeakers();
    return;
  }

  // day-last-words: AI被投出/被猎人带走时自动生成遗言，人类被投出/被带走但用户存活时短暂展示后自动推进
  if (state.phase === 'day-last-words') {
    const queue = state.lastWordsPlayerId;
    if (queue.length > 0) {
      const exiledId = queue[0];
      const exiled = state.players.find(p => p.id === exiledId);
      if (exiled && exiled.isAI) {
        // AI 玩家 → 自动生成遗言（防止重复调用）
        if (!generatingLastWords) {
          generatingLastWords = true;
          generateAILastWords(state, exiled);
        }
        return;
      }
      // 人类玩家但不是当前用户（用户存活）→ 等待短暂展示后自动推进
      const userPlayer = state.players.find(p => !p.isAI);
      if (userPlayer && userPlayer.isAlive && exiledId !== userPlayer.id) {
        setTimeout(() => {
          const s = useGameStore.getState().gameState;
          if (s && s.phase === 'day-last-words') {
            useGameStore.getState().advancePhase();
          }
        }, 3000);
        return;
      }
    }
    return;
  }

  // Skip phases for dead roles
  if (state.phase === 'night-seer' && !hasRoleAlive(state, 'seer')) {
    useGameStore.getState().advancePhase();
    return;
  }
  if (state.phase === 'night-witch' && !hasRoleAlive(state, 'witch')) {
    useGameStore.getState().advancePhase();
    return;
  }
  if (state.phase === 'night-guard' && !hasRoleAlive(state, 'guard')) {
    useGameStore.getState().advancePhase();
    return;
  }

  // Check if user needs to act
  const userPlayer = state.players.find(p => !p.isAI);
  const userIsAlive = userPlayer ? userPlayer.isAlive : false;

  if (userIsAlive) {
    const needsUserAction =
      (state.phase === 'night-werewolf' && userPlayer!.role === 'werewolf') ||
      (state.phase === 'night-seer' && userPlayer!.role === 'seer') ||
      (state.phase === 'night-witch' && userPlayer!.role === 'witch') ||
      (state.phase === 'night-guard' && userPlayer!.role === 'guard') ||
      (state.phase === 'day-vote');

    if (needsUserAction) {
      // 平票补投：人类玩家是平票者不能投票 → 自动触发 AI 投票
      if (state.phase === 'day-vote' && state.tiePlayerIds.length > 0 && state.tiePlayerIds.includes(userPlayer!.id)) {
        processAIVotes();
        return;
      }
      // Don't auto-skip, wait for user
      return;
    }
  }

  // If user is dead or doesn't need to act, process AI
  if (state.phase.startsWith('night-') && state.phase !== 'night-result' && state.phase !== 'night-summary') {
    processAINightActions();
  }

  // night-result: show result briefly then auto-advance to day
  if (state.phase === 'night-result') {
    setTimeout(() => {
      const s = useGameStore.getState().gameState;
      if (s && s.phase === 'night-result' && !s.gameResult) {
        useGameStore.getState().advancePhase();
      }
    }, 1500);
    return;
  }

  // === 人类玩家死亡后的自动推进逻辑 ===
  // 当人类玩家死亡后，需要自动推进白天阶段的流程
  if (!userIsAlive) {
    // day-discussion: 检查是否所有 AI 发言完毕，完毕则自动进入投票
    if (state.phase === 'day-discussion') {
      if (state.currentSpeakerIndex >= state.discussionOrder.length) {
        // 所有发言完毕，自动进入投票阶段
        setTimeout(() => {
          const s = useGameStore.getState().gameState;
          if (s && s.phase === 'day-discussion' && !s.gameResult) {
            useGameStore.getState().advancePhase();
          }
        }, 1000);
      } else {
        // 还有未发言的 AI，继续检查
        setTimeout(() => autoSkipPhases(), 500);
      }
      return;
    }

    // day-vote: 自动处理 AI 投票并推进到开票
    if (state.phase === 'day-vote') {
      processAIVotes();
      return;
    }

    // tie-speech: 自动处理 AI 平票发言
    if (state.phase === 'tie-speech') {
      processTieSpeakers();
      return;
    }
  }
}

// ============ Discussion Order & Speaker Management ============

/**
 * 构建顺时针发言顺序
 * 规则：有死者时从死者下一位开始顺时针，无死者时随机选一位开始顺时针
 */
function buildDiscussionOrder(state: GameState): string[] {
  const alivePlayers = state.players.filter(p => p.isAlive);
  if (alivePlayers.length === 0) return [];

  const aliveIds = alivePlayers.map(p => p.id);
  const playerCount = state.players.length;

  // 确定起点
  let startIndex = 0;
  if (state.lastKilledId) {
    // 有死者：从死者顺时针方向的下一位开始
    const killedPlayerIndex = state.players.findIndex(p => p.id === state.lastKilledId);
    if (killedPlayerIndex >= 0) {
      // 从死者下一位开始顺时针找第一个存活玩家
      for (let offset = 1; offset <= playerCount; offset++) {
        const idx = (killedPlayerIndex + offset) % playerCount;
        if (state.players[idx].isAlive) {
          startIndex = idx;
          break;
        }
      }
    }
  } else {
    // 无死者（平安夜）：随机选一个存活玩家作为起点
    const randomAlive = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    startIndex = state.players.findIndex(p => p.id === randomAlive.id);
    if (startIndex < 0) startIndex = 0;
  }

  // 从起点顺时针收集所有存活玩家的 ID
  const order: string[] = [];
  for (let offset = 0; offset < playerCount; offset++) {
    const idx = (startIndex + offset) % playerCount;
    const player = state.players[idx];
    if (player.isAlive) {
      order.push(player.id);
    }
  }

  return order;
}

/**
 * 开始下一个发言者
 * 如果当前发言者是人类玩家，等待用户输入
 * 如果是 AI 玩家，自动调用 generateAIDiscussion
 * 如果全部发言完毕，提示可以进入投票
 */
function startNextSpeaker() {
  const state = useGameStore.getState().gameState;
  if (!state || state.phase !== 'day-discussion') return;

  const currentIdx = state.currentSpeakerIndex;
  const order = state.discussionOrder;

  // 全部发言完毕，等待玩家手动点击「进入投票」按钮
  if (currentIdx >= order.length) {
    return;
  }

  const speakerId = order[currentIdx];
  const speaker = state.players.find(p => p.id === speakerId);
  if (!speaker || !speaker.isAlive) {
    // 跳过已死亡玩家（理论上不会出现）
    setNextSpeakerAndContinue(state, currentIdx);
    return;
  }

  if (speaker.isAI) {
    // AI 玩家自动发言
    useGameStore.getState().generateAIDiscussion();
  }
  // 人类玩家：等待用户输入（sendDiscussionMessage 会推进）
}

function setNextSpeakerAndContinue(state: GameState, currentIdx: number) {
  const nextIdx = currentIdx + 1;
  useGameStore.setState({
    gameState: { ...state, currentSpeakerIndex: nextIdx }
  });
  setTimeout(() => startNextSpeaker(), 300);
}

/**
 * 后备发言模板（API 不可用时）
 */
function getFallbackSpeech(player: Player): string {
  const speeches: Record<string, string[]> = {
    werewolf: [
      '我觉得我们应该先冷静分析，不要急着下定论。',
      '我注意到有些人的发言前后矛盾，大家仔细回想一下。',
      '作为普通村民，我建议大家多听听各方意见。',
      '我感觉某些人太过急于引导投票方向了，这很可疑。',
    ],
    seer: [
      '我有一些信息，但还需要再观察一轮才能确定。',
      '请大家仔细分析每个人的发言模式，可能会有线索。',
      '我建议大家关注那些发言较少的人。',
    ],
    witch: [
      '局势还在可控范围内，大家不要慌乱。',
      '我建议大家多关注发言细节，有些人明显在掩饰什么。',
    ],
    guard: [
      '我会尽我所能保护大家，请放心。',
      '我建议大家把注意力放在行为异常的人身上。',
    ],
    hunter: [
      '我这个人说话比较直，但都是为了大家好。',
      '不要觉得可以随便欺负人，有些人可不是好惹的。',
    ],
    villager: [
      '作为普通村民，我会用逻辑来推理。',
      '大家不要只凭感觉投票，需要有理有据。',
      '我注意到有些人的发言和之前不一致。',
      '我想听听更多人的看法，每个人的视角都很重要。',
    ],
  };
  const options = speeches[player.role] || speeches.villager;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * 为被投票放逐的 AI 玩家生成遗言
 */
const lastWordsFallbacks: Record<string, string[]> = {
  werewolf: [
    '哼，你们会后悔的...真正的狼人还在你们中间！',
    '虽然我被投出去了，但我要说——好人阵营的判断力真是让人失望。',
    '好吧，我承认我的发言确实有漏洞，但请你们仔细想想真正可疑的人。',
  ],
  seer: [
    '我是预言家！请相信我最后的话——仔细看我查过的信息。',
    '虽然我不在了，但我留下的查验记录会帮助你们找到真相。',
    '好人加油，我相信你们最终会取得胜利。',
  ],
  witch: [
    '我尽力了...希望我的药水没有白费。',
    '好人阵营还需要继续努力，不要被狼人带偏了节奏。',
    '我会在天上看着你们，希望你们能找出所有的狼人。',
  ],
  guard: [
    '我已经尽力守护了，接下来就看你们的了。',
    '虽然我被投出去了，但我相信好人的判断力。',
    '大家加油，胜利一定属于正义的一方。',
  ],
  hunter: [
    '没想到我会以这种方式离开...但我的子弹不会浪费！',
    '虽然被投出去了，但我无怨无悔。好人加油！',
    '这就是我的结局吗？好吧，至少我带走了一个。',
  ],
  villager: [
    '我是无辜的村民！请你们擦亮眼睛，找出真正的狼人。',
    '虽然我被冤枉了，但我希望好人阵营能从我的死中获得线索。',
    '再见了各位，希望我的牺牲能帮助好人找到真相。',
  ],
};

let generatingLastWords = false;

async function generateAILastWords(state: GameState, exiledPlayer: Player) {
  const roleName = ROLE_NAMES[exiledPlayer.role];
  let content: string | null = null;

  // 调用 LLM 生成遗言
  if (isAIConfigured()) {
    try {
      // 构建投票详情
      const voteRecords = state.previousDayVotes || {};
      const voteReasons = state.previousDayVoteReasons || {};
      const playerMap = new Map(state.players.map(p => [p.id, p]));
      const exiledVoters: string[] = [];
      const otherVoters: string[] = [];
      for (const [voterId, targetId] of Object.entries(voteRecords)) {
        const voter = playerMap.get(voterId);
        if (!voter) continue;
        const voterName = getAIName(voter);
        const target = targetId === 'skip' ? null : playerMap.get(targetId);
        const targetName = targetId === 'skip' ? '弃票' : (target ? getAIName(target) : '未知');
        const reason = voteReasons[voterId] || '';
        const entry = `${voterName}→${targetName}`;
        if (targetId === exiledPlayer.id) {
          exiledVoters.push(entry);
        } else {
          otherVoters.push(entry);
        }
      }
      const voteCount = exiledVoters.length;
      const voteDetailStr = [
        `投给 ${getAIName(exiledPlayer)} 的玩家（${voteCount}票）：`,
        ...(exiledVoters.length > 0 ? exiledVoters.map(v => `  - ${v}`) : ['  （无）']),
        '',
        '其他投票：',
        ...(otherVoters.length > 0 ? otherVoters.map(v => `  - ${v}`) : ['  （无）']),
      ].join('\n');

      // 存活/死亡玩家列表
      const alivePlayers = state.players.filter(p => p.isAlive);
      const deadPlayers = state.players.filter(p => !p.isAlive);

      // 构建角色专属信息（参考 buildVoteContext 的结构）
      let rolePrivateInfo = '';
      if (exiledPlayer.role === 'werewolf') {
        const teammates = state.players.filter(
          p => p.role === 'werewolf' && p.id !== exiledPlayer.id
        );
        rolePrivateInfo = `- 你是狼人，你的狼队友是：${teammates.length > 0 ? teammates.map(w => `${getAIName(w)}${w.isAlive ? '' : '（已死亡）'}`).join('、') : '（你是唯一的狼人）'}
- 你的目标是淘汰好人阵营，可以在遗言中混淆视听
- ⚠️ 遗言中绝对不要暴露狼队友的身份，但可以暗示某些好人是狼
- 可以把嫌疑引向好人，说怀疑某人的表现`;
      } else if (exiledPlayer.role === 'seer') {
        rolePrivateInfo = '- 你是预言家，可以在遗言中透露你的查验信息来帮助好人阵营\n- 如果查到了狼人，一定要在遗言中说出来\n- 如果没有查到狼人，也要把你查验过的好人告诉大家，帮助缩小范围';
      } else if (exiledPlayer.role === 'witch') {
        rolePrivateInfo = `- 你是女巫
- 你的解药：${exiledPlayer.hasAntidote ? '✅ 可用（但你已经死了，无法使用）' : '❌ 已使用'}
- 你的毒药：${exiledPlayer.hasPoison ? '✅ 可用（但你已经死了，无法使用）' : '❌ 已使用'}
- 如果你用过药，可以在遗言中透露相关信息帮助好人`;
      } else if (exiledPlayer.role === 'guard') {
        rolePrivateInfo = '- 你是守卫，可以在遗言中透露你的守护记录帮助好人分析';
      } else if (exiledPlayer.role === 'hunter') {
        rolePrivateInfo = '- 你是猎人，如果你已经开了枪，可以在遗言中表达你的感受和判断';
      } else if (exiledPlayer.role === 'villager') {
        rolePrivateInfo = '- 你是普通村民，没有特殊信息\n- 可以基于你在讨论中观察到的异常行为来分析谁最可疑';
      }

      // 构建完整的上下文提示词
      const prompt = `## 当前游戏状态

### 第 ${state.round + 1} 轮 - 遗言阶段

### ⚠️ 你被投票放逐出局了！
- 你的名字：${getAIName(exiledPlayer)}
- 你的身份：${roleName}
- 你获得了 ${voteCount} 票

### 🗳️ 本轮投票详情：
${voteDetailStr}

### 当前存活玩家（${alivePlayers.length}人）：
${alivePlayers.map(p => `- ${getAIName(p)}`).join('\n')}

### 已死亡玩家（${deadPlayers.length}人）：
${deadPlayers.length > 0 ? deadPlayers.map(p => `- ${getAIName(p)}`).join('\n') : '（暂无其他死亡玩家）'}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, exiledPlayer.id)}

### 🔒 只有你知道的信息：
${rolePrivateInfo}

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, exiledPlayer)}

---

你在本轮白天被投票放逐，这是你最后一次发言机会。请发表一段有质量的遗言。

遗言要求：
- 根据你的角色身份和阵营立场来发表合理的遗言
- 可以基于讨论中的信息和投票结果来分析场上局势
${exiledPlayer.role === 'werewolf' ? '- ⚠️ 你是狼人，遗言中要混淆视听，可以暗示好人是狼人，但绝对不能暴露你的狼队友！' : ''}
${exiledPlayer.role === 'seer' ? '- 你是预言家，如果查验到了狼人一定要说出来，遗言是好人的最后希望' : ''}
- 发言长度：100-500字，要有实质内容，不要空洞

请严格按照以下格式回复（只回复遗言内容，不要加任何前缀、标签或说明）：
你的遗言内容`;

      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: buildRoleSystemPrompt(exiledPlayer.role, exiledPlayer.name, state) + '\n\n你刚刚在本轮白天被投票放逐出局，这是你发表遗言的时刻。请根据你的角色身份和阵营，发表一段符合你立场的遗言。' },
        { role: 'user', content: prompt },
      ];
      const response = await callLLM(messages);
      if (response && response.length >= 20 && response.length <= 500) {
        content = response;
      }
    } catch {
      // LLM 调用失败
      console.error('AI 遗言生成失败');
    }
  }

  if (!content) {
    generatingLastWords = false;
    // LLM 失败也需推进游戏
    setTimeout(() => {
      const s = useGameStore.getState().gameState;
      if (s && s.phase === 'day-last-words') {
        useGameStore.getState().advancePhase();
      }
    }, 500);
    return;
  }

  // 将遗言添加到日志
  const currentState = useGameStore.getState().gameState;
  if (!currentState || currentState.phase !== 'day-last-words') {
    generatingLastWords = false;
    return;
  }

  const logs = [...currentState.logs, {
    id: `log-${currentState.logs.length}`,
    round: currentState.round,
    phase: 'day-last-words' as const,
    message: `💬 ${exiledPlayer.name}（${roleName}）的遗言：「${content}」`,
    timestamp: Date.now(),
  }];

  useGameStore.setState({
    gameState: { ...currentState, logs: dedupeLogs(logs) }
  });

  generatingLastWords = false;

  // 延迟后自动进入 day-result
  setTimeout(() => {
    const s = useGameStore.getState().gameState;
    if (s && s.phase === 'day-last-words') {
      useGameStore.getState().advancePhase();
    }
  }, 3000);
}

// ============ Tie-breaker ============

let tieSpeakingInProgress = false;

function processTieSpeakers() {
  const state = useGameStore.getState().gameState;
  if (!state || state.phase !== 'tie-speech') return;
  if (tieSpeakingInProgress) return; // 防止 LLM 调用期间重复进入

  const tieIds = state.tiePlayerIds;
  const idx = state.tieSpeakerIndex;

  if (idx >= tieIds.length) {
    // 所有平票玩家已发言，进入重新投票（只统计非平票玩家的投票）
    tieSpeakingInProgress = false;
    useGameStore.getState().advancePhase();
    return;
  }

  const speakerId = tieIds[idx];
  const speaker = state.players.find(p => p.id === speakerId);

  if (!speaker || !speaker.isAlive) {
    // 跳过死亡玩家
    useGameStore.setState({ gameState: { ...state, tieSpeakerIndex: idx + 1 } });
    setTimeout(() => processTieSpeakers(), 300);
    return;
  }

  // 给平票玩家添加发言到 discussionMessages
  if (speaker.isAI) {
    // AI 调用大模型生成补发言
    tieSpeakingInProgress = true;
    const currentState = useGameStore.getState().gameState;
    if (!currentState || currentState.phase !== 'tie-speech') return;

    aiGenerateTieSpeech(currentState, speaker).then((speech) => {
      const s = useGameStore.getState().gameState;
      if (!s || s.phase !== 'tie-speech' || s.tieSpeakerIndex !== idx) return;

      const newMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        playerId: speaker.id, playerName: speaker.name,
        content: `【平票补发言】${speech || getFallbackSpeech(speaker)}`,
        round: s.round, timestamp: Date.now(),
      };
      const logs = [...s.logs, {
        id: `log-${s.logs.length}`, round: s.round, phase: 'tie-speech',
        message: `⚖️ ${speaker.name}（平票玩家）补充发言`,
        timestamp: Date.now(),
      }];
      useGameStore.setState({
        gameState: {
          ...s,
          discussionMessages: [...s.discussionMessages, newMsg],
          tieSpeakerIndex: idx + 1,
          logs: dedupeLogs(logs),
        }
      });
      tieSpeakingInProgress = false;
      setTimeout(() => processTieSpeakers(), 800);
    }).catch(() => {
      // LLM 调用失败，使用后备发言
      const s = useGameStore.getState().gameState;
      if (!s || s.phase !== 'tie-speech' || s.tieSpeakerIndex !== idx) return;

      const speech = getFallbackSpeech(speaker);
      const newMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        playerId: speaker.id, playerName: speaker.name,
        content: `【平票补发言】${speech}`,
        round: s.round, timestamp: Date.now(),
      };
      const logs = [...s.logs, {
        id: `log-${s.logs.length}`, round: s.round, phase: 'tie-speech',
        message: `⚖️ ${speaker.name}（平票玩家）补充发言`,
        timestamp: Date.now(),
      }];
      useGameStore.setState({
        gameState: {
          ...s,
          discussionMessages: [...s.discussionMessages, newMsg],
          tieSpeakerIndex: idx + 1,
          logs: dedupeLogs(logs),
        }
      });
      tieSpeakingInProgress = false;
      setTimeout(() => processTieSpeakers(), 800);
    });
  } else {
    // 人类玩家等待手动发言
    return;
  }
}

function startTieSpeaker() {
  const state = useGameStore.getState().gameState;
  if (!state || state.phase !== 'tie-speech') return;

  const tieIds = state.tiePlayerIds;
  if (tieIds.length === 0) {
    useGameStore.getState().advancePhase();
    return;
  }

  useGameStore.setState({ gameState: { ...state, tieSpeakerIndex: 0 } });
  setTimeout(() => processTieSpeakers(), 600);
}

// ============ Note ============
// AI Discussion & Night Actions have been moved to services/aiService.ts
// The old template-based speech generator has been removed.
// When no API is configured, aiService provides fallback templates.
