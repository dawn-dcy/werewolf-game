export type Role = 'werewolf' | 'villager' | 'seer' | 'witch' | 'hunter' | 'guard';

export interface Player {
  id: string;
  name: string;
  role: Role;
  isAI: boolean;
  isAlive: boolean;
  avatarSeed: number;
  // Witch state
  hasAntidote: boolean;
  hasPoison: boolean;
  // Guard state
  lastGuardedId: string | null;
}

export type GamePhase =
  | 'lobby'
  | 'role-reveal'
  | 'night-summary'
  | 'night-werewolf'
  | 'night-seer'
  | 'night-witch'
  | 'night-guard'
  | 'night-result'
  | 'day-discussion'
  | 'day-vote'
  | 'day-result'
  | 'tie-speech'
  | 'hunter-shoot'
  | 'game-over';

export type GameResult = 'werewolf-win' | 'villager-win' | null;

export interface GameLog {
  id: string;
  round: number;
  phase: GamePhase;
  message: string;
  timestamp: number;
}

export interface DiscussionMessage {
  id: string;
  playerId: string;
  playerName: string;
  content: string;
  round: number;
  timestamp: number;
}

export interface RoundSummary {
  round: number;
  summary: string;  // AI 生成的轮次讨论摘要
}

export interface SeerCheckRecord {
  round: number;
  targetId: string;
  isWerewolf: boolean;
}

export interface NightActionRecord {
  round: number;
  phase: string;
  actorId: string;          // 行动者ID
  actorName: string;        // 行动者名字
  actorRole: Role;          // 行动者角色
  action: string;           // 行动描述
  targetId: string | null;  // 目标ID
  targetName: string | null;// 目标名字
}

export interface HunterShootPending {
  hunterId: string;                   // 猎人玩家 ID
  returnPhase: GamePhase;             // 开枪后返回的阶段
  updatedPlayers: Player[];           // 已处理的玩家状态（猎人已死亡）
  logs: GameLog[];                    // 已累积的日志
  nightActions: NightActionRecord[];  // 已记录的夜晚行动
  previousDayVotes: Record<string, string>;
  previousDayVoteReasons: Record<string, string>;
}

export interface GameState {
  players: Player[];
  phase: GamePhase;
  round: number;
  gameResult: GameResult;
  logs: GameLog[];
  // Discussion messages (persisted across renders)
  discussionMessages: DiscussionMessage[];
  // AI 生成的各轮次讨论摘要（当前轮为完整发言，历史轮为摘要）
  roundSummaries: RoundSummary[];
  // Discussion order tracking
  discussionOrder: string[];           // 本轮发言顺序（玩家ID列表，按顺时针排列）
  currentSpeakerIndex: number;         // 当前发言者索引（-1 表示尚未开始）
  // Night targets
  werewolfTargetId: string | null;
  witchKillTargetId: string | null; // poison target
  witchSaveTargetId: string | null; // antidote target (auto-set to werewolf target)
  seerCheckTargetId: string | null;
  seerCheckHistory: SeerCheckRecord[];   // 预言家所有轮次的查验记录（持久化，防止重复验人）
  guardProtectTargetId: string | null;
  // Vote tracking
  dayVotes: Record<string, string>; // voterId -> targetId
  dayVoteReasons: Record<string, string>; // voterId -> reason (AI only)
  previousDayVotes: Record<string, string>; // snapshot of last round votes (voterId -> targetId)
  previousDayVoteReasons: Record<string, string>; // snapshot of last round reasons
  // Last killed player
  lastKilledId: string | null;
  lastSaved: boolean;
  lastPoisoned: boolean;
  // Tie breaker
  tiePlayerIds: string[];              // 平票玩家ID列表（需要重新发言+投票）
  tieSpeakerIndex: number;             // 平票补发言索引
  tieVotes: Record<string, string>;    // 平票补投 voterId -> targetId
  // Night action logs for god view (persisted across rounds)
  nightActions: NightActionRecord[];   // 所有夜晚行动记录（上帝视角用）
  // 内部标记：是否正在生成轮次摘要（防止重复点击"夜幕降临"）
  _isGeneratingSummary: boolean;
  // 猎人开枪待处理状态（人类玩家猎人死亡时暂停）
  hunterShootPending: HunterShootPending | null;
  // MVP 评选结果
  mvpPlayerId: string | null;
  mvpReason: string | null;
  _mvpSelected: boolean;
}

export interface GameConfig {
  playerCount: number;
  roleDistribution: Record<Role, number>;
}
