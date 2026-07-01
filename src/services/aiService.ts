/**
 * AI Service - 真实大模型 API 调用模块
 *
 * 设计原则：
 * 1. 每个 AI 玩家独立调用 API，拥有独立的对话上下文
 * 2. 根据角色身份构建不同的系统提示词
 * 3. 该知道的信息告诉 AI，不该知道的不告诉
 * 4. 狼人之间共享队友信息，但不知道具体身份角色
 */

import { GameState, Player, Role, DiscussionMessage } from '../types/game';

// ============ API 配置 ============

export interface AIConfig {
  apiUrl: string;       // API endpoint, e.g. https://api.openai.com/v1/chat/completions
  apiKey: string;       // API key
  model: string;        // Model name, e.g. gpt-4o, gpt-3.5-turbo, deepseek-chat
  maxTokens: number;    // Max tokens per response
  temperature: number;  // 0.0-2.0
  thinking: boolean;    // 是否开启思考模式（DeepSeek 等模型支持）
}

const DEFAULT_CONFIG: AIConfig = {
  apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  model: 'deepseek-v4-flash',
  maxTokens: 4096,
  temperature: 0.8,
  thinking: false,
};

let currentConfig: AIConfig = { ...DEFAULT_CONFIG };

// Load saved config from localStorage
export function loadAIConfig(): AIConfig {
  try {
    const saved = localStorage.getItem('werewolf-ai-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      currentConfig = { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...currentConfig };
}

export function saveAIConfig(config: Partial<AIConfig>): AIConfig {
  currentConfig = { ...currentConfig, ...config };
  try {
    localStorage.setItem('werewolf-ai-config', JSON.stringify(currentConfig));
  } catch { /* ignore */ }
  return { ...currentConfig };
}

export function getAIConfig(): AIConfig {
  return { ...currentConfig };
}

export function isAIConfigured(): boolean {
  return currentConfig.apiKey.trim().length > 0;
}

// ============ 角色名称映射 ============

const ROLE_NAMES: Record<Role, string> = {
  werewolf: '狼人',
  villager: '村民',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  guard: '守卫',
};

const ROLE_ICONS: Record<Role, string> = {
  werewolf: '🐺',
  villager: '👤',
  seer: '🔮',
  witch: '🧪',
  hunter: '🏹',
  guard: '🛡️',
};

// ============ 辅助：获取 AI 可见的玩家名（去掉 (你) 后缀） ============

/** 获取 AI prompt 中使用的玩家名（人类玩家去掉 (你) 后缀） */
function getAIName(player: Player): string {
  return player.name.replace(/\(你\)$/, '');
}

/** 获取所有存活玩家名列表（用于 prompt） */
function getAlivePlayerNames(state: GameState): string[] {
  return state.players.filter(p => p.isAlive).map(p => getAIName(p));
}

// ============ 游戏规则（根据实际玩家身份动态生成） ============

/** 根据游戏实际角色分布动态生成游戏规则 */
function buildGameRules(state: GameState): string {
  // 统计本局实际存在的角色
  const roleCounts = new Map<Role, number>();
  for (const p of state.players) {
    roleCounts.set(p.role, (roleCounts.get(p.role) || 0) + 1);
  }

  const roleDescriptions: Record<Role, string> = {
    werewolf: `- 🐺 **狼人**：属于狼人阵营。每晚必须击杀一名玩家（不能空刀）。狼人之间互相认识（知道谁是队友），但不知道其他玩家的具体身份。白天需要伪装成好人发言，引导其他人投票出局好人。本局共 ${roleCounts.get('werewolf') || 0} 名狼人。`,
    villager: `- 👤 **村民**：属于好人阵营。没有特殊技能，通过推理和投票找出狼人。本局共 ${roleCounts.get('villager') || 0} 名村民。`,
    seer: `- 🔮 **预言家**：属于好人阵营。每晚可以查验一名玩家的身份，得知他是"狼人"还是"好人"（但不会知道具体身份如女巫、猎人等）。`,
    witch: `- 🧪 **女巫**：属于好人阵营。拥有一瓶解药（救活被狼人杀的玩家）和一瓶毒药（毒杀一名玩家），每瓶药各只能使用一次。女巫在使用解药之前，知道每晚谁被狼人杀害了；解药用掉之后，不再得知当夜的击杀目标。`,
    hunter: `- 🏹 **猎人**：属于好人阵营。被投票放逐或被狼人杀害时，可以开枪带走一名玩家。⚠️ 重要：如果猎人夜晚被狼人杀害，开枪不会暴露猎人身份（大家只会看到多死了一个人）；如果猎人白天被投票放逐，全场会公开宣布猎人身份及其开枪带走了谁。`,
    guard: `- 🛡️ **守卫**：属于好人阵营。每晚可以守护一名玩家，使其当晚不会被狼人杀死。不能连续两晚守护同一名玩家。`,
  };

  // 只列出本局实际存在的角色
  const activeRoles = Object.keys(roleDescriptions).filter(
    r => roleCounts.get(r as Role) && roleCounts.get(r as Role)! > 0
  ) as Role[];

  // 夜晚流程也根据实际角色动态生成
  const nightFlowSteps = ['狼人选择击杀目标'];
  if (roleCounts.get('seer')) nightFlowSteps.push('预言家查验');
  if (roleCounts.get('witch')) nightFlowSteps.push('女巫决定用药');
  if (roleCounts.get('guard')) nightFlowSteps.push('守卫选择守护');
  const nightFlow = nightFlowSteps.join(' → ');

  // 重要规则也动态生成
  const specialRules: string[] = [
    '- 狼人每夜必须击杀一名玩家（不能空刀，不可跳过）',
  ];
  if (roleCounts.get('witch')) {
    specialRules.push('- 女巫的解药和毒药不能在同一晚使用');
    specialRules.push('- 女巫在使用解药之后，不再得知当晚狼人的击杀目标（不知道刀口）');
  }
  if (roleCounts.get('guard')) {
    specialRules.push('- 守卫不能连续守护同一人');
  }
  specialRules.push('- 预言家查验结果只有"狼人"或"好人"');
  specialRules.push('- 每位玩家在白天发言的时候，应该表露一下自己的身份，可以是真的也可以是假的，基于自己的立场决定');
  if (roleCounts.get('hunter')) {
    specialRules.push('- ⚠️ 猎人规则：夜晚被狼人杀害时开枪不暴露身份（大家只会看到多死一人，不知道是猎人开枪）；白天被投票放逐时，全场会公开宣布猎人身份及带走目标');
  }

  return `# 狼人杀游戏规则

## 游戏概述
这是一个经典的狼人杀桌游，玩家分为狼人阵营和好人阵营。本局共 ${state.players.length} 名玩家。

## 角色介绍
${activeRoles.map(r => roleDescriptions[r]).join('\n')}

## 游戏流程
1. 夜晚阶段：${nightFlow}
2. 白天阶段：公布夜晚结果 → 讨论发言 → 投票放逐 → 公布结果
3. 重复直到一方胜利

## 胜利条件（屠边规则）
- 狼人阵营：杀死所有神职（预言家、女巫、猎人、守卫）或杀死所有村民，即可获胜
- 好人阵营：放逐所有狼人

## 重要规则
${specialRules.join('\n')}
`;}

// ============ 构建角色专用系统提示词 ============

export function buildRoleSystemPrompt(role: Role, playerName: string, state?: GameState): string {
  const rules = state ? buildGameRules(state) : '';
  const displayName = playerName.replace(/\(你\)$/, '');
  const base = `${rules}
---
你正在参与一局狼人杀游戏。你的名字是「${displayName}」。
请完全代入这个角色进行游戏，用中文回复。`;

  switch (role) {
    case 'werewolf':
      return `${base}

## 你的身份：🐺 狼人
- 你属于狼人阵营。
- 你的目标：杀死所有神职或所有村民（屠边）即可获胜。
- 你的策略：
  1. 夜晚时与队友协商选择击杀目标，可以自刀骗解药
  2. 白天时伪装成好人，发表看似合理的推理
  3. 可以主动引导舆论，把嫌疑引向好人
  4. 不要暴露自己和队友的身份
  5. 发言要自然，像一个好人一样思考
  6. 可以假装分析局势、怀疑某人，但要避免过于刻意
  7. 白天投票时优先投好人，也可以投狼队友来掩护身份
  8. 投票策略：优先票走预言家、女巫等神职；如果没有把握则跟风投被大家怀疑的好人
- ⚠️ 绝对禁止事项（违反即自爆，会导致输掉游戏）：
  1. 绝对不能说"我是狼人"或任何暗示自己是狼人的话
  2. 绝对不能提"狼队友""我的队友""我们狼人"等暴露团伙的词
  3. 绝对不能提夜晚刀人/杀人的任何信息（如"昨晚我刀了X号""我们选择了X号作为目标"）
  4. 绝对不能暴露你知道谁是其他狼人（不能说"我知道X号是好人因为他是我的队友"之类的话）
  5. 即使别人怀疑你，也要坚决否认，像好人一样为自己辩护
  6. 如果必须报身份，只能报"村民"或"预言家"等好人身份`;

    case 'seer':
      return `${base}

## 你的身份：🔮 预言家
- 你属于好人阵营。
- 你的技能：每晚可以查验一名玩家的身份（狼人/好人）。
- 你的策略：
  1. 夜晚选择查验目标，优先查验可疑玩家
  2. ⚠️ 每晚必须查验不同的玩家，绝对不能重复查验已查验过的玩家
  3. 白天讨论时，结合你的查验结果来分析——如果你验出狼人，在合适的时机跳身份报查验结果带队投票
  4. 如果验出狼人，要大胆说出来引导投票；如果验出好人，可以帮助澄清
  5. 自己根据场上的局势来分析是否暴露自己的预言家身份，也可以为了游戏胜利伪装其他身份。
  6. 分析讨论记录中其他人的发言，与你的查验结果对照，找出矛盾
  7. 投票时：验出的狼人优先投，验出的好人不要投
- 注意事项：你是好人的眼睛，你的信息至关重要！不要浪费查验机会，但也要在适当时机把信息传给好人阵营！`;

    case 'witch':
      return `${base}

## 你的身份：🧪 女巫
- 你属于好人阵营。
- 你的技能：一瓶解药（救人）、一瓶毒药（杀人），各只能用一次。
- 每晚你会知道谁被狼人杀害了。
- 你的策略：
  1. ⚠️ 第一晚强烈建议使用解药（先救人再说，你不知道被杀的会不会是预言家或其他神职），但是有可能是狼人自刀
  2. 如果你自己被狼人杀害了（这是常见情况），你完全可以而且应该用解药自救！
  3. 解药救人后你就知道救的是好人，他信任度很高，值得保护，如果你救的人发言不做好，有可能是狼人自刀骗解药
  4. 毒药留给关键时机使用（如确定某人是狼人时），不要随意用毒
  5. 白天发言根据场上的局势自由选择是否暴露自己是女巫或者跳其他身份
  6. 如果使用了解药或毒药，注意观察场上反应
- 注意事项：解药必须在第一晚或你被刀时优先使用！如果你死了好人直接少一个神，非常亏！`;

    case 'guard':
      return `${base}

## 你的身份：🛡️ 守卫
- 你属于好人阵营。
- 你的技能：每晚可以守护一名玩家，使其不被狼人杀害。
- 限制：不能连续两晚守护同一名玩家。
- 你的策略：
  1. 优先守护可能被狼人盯上的关键角色（通过讨论中谁被怀疑或被针对来判断）
  2. 如果预言家已经暴露或跳了身份，一定要守护他
  3. 也可以守护自己（如果你觉得今晚自己可能有危险）
  4. 白天发言保持低调，不要暴露守卫身份
  5. 像普通村民一样参与推理和讨论，冷静分析每个人的发言
- 注意事项：你默默守护着村庄，通过守护关键角色为好人争取时间！`;

    case 'hunter':
      return `${base}

## 你的身份：🏹 猎人
- 你属于好人阵营。
- 你的技能：被投票放逐或被狼人杀害时，可以开枪带走一名玩家。
- ⚠️ 关键规则：
  - 如果你夜晚被狼人杀害：开枪是无声的，全场不会知道你是猎人，只会看到多死了一个人。
  - 如果你白天被投票放逐：全场会公开宣布「XX（猎人）在临死前开枪带走了 XX」。
- 你的策略：
  1. 积极参与讨论，大胆发表看法
  2. 自由选择根据场上的局势，是否暴露自己的猎人身份，也可以为了游戏胜利伪装成其他身份
  3. 如果确定要出局，选择一个最怀疑的目标带走
- 注意事项：你的死不是终点，可以为好人阵营做出最后贡献！`;

    case 'villager':
      return `${base}

## 你的身份：👤 村民
- 你属于好人阵营。
- 你没有特殊技能，但你唯一的武器是推理和观察，你的投票和发言至关重要。
- 你的策略：
  1. 仔细聆听讨论记录中每个人的发言，寻找逻辑矛盾和破绽
  2. 积极参与讨论，大胆发表你的推理和怀疑
  3. 不要轻易跟票，要有自己独立的分析和判断
  4. 如果有人发言前后矛盾、故意带节奏、或转移话题，那很可能是狼人——指出来
  5. 可以质疑任何人的发言，包括那些自称预言家的人（狼人也可能伪装成预言家）
  6. 你可以引用具体玩家的话来支撑你的观点
- 注意事项：虽然你没有特殊能力，但你是好人阵营的中坚力量！你的每一次推理都可能左右局势！`;

    default:
      return base;
  }
}

// ============ 构建具体场景的上下文 ============

// 获取所有玩家列表描述
function getPlayerList(state: GameState): string {
  return state.players.map(p => {
    const alive = p.isAlive ? '存活' : '已淘汰';
    return `- ${getAIName(p)}（${alive}）`;
  }).join('\n');
}

// 获取按轮次组织的完整历史摘要（讨论 + 投票结果）
// selfPlayerId: 可选，传入后会在该玩家的发言后面标注「你自己」
function getRoundHistory(state: GameState, selfPlayerId?: string): string {
  const currentRound = state.round;

  // 按轮次分组讨论消息
  const messagesByRound = new Map<number, DiscussionMessage[]>();
  for (const m of state.discussionMessages) {
    if (!messagesByRound.has(m.round)) {
      messagesByRound.set(m.round, []);
    }
    messagesByRound.get(m.round)!.push(m);
  }

  // 按轮次提取投票结果日志
  const voteResultsByRound = new Map<number, string[]>();
  for (const log of state.logs) {
    if (log.phase === 'day-result') {
      if (!voteResultsByRound.has(log.round)) {
        voteResultsByRound.set(log.round, []);
      }
      voteResultsByRound.get(log.round)!.push(cleanLogMessage(log.message, state));
    }
  }

  // 按轮次提取夜晚结果日志
  const nightResultsByRound = new Map<number, string[]>();
  for (const log of state.logs) {
    if (log.phase === 'night-result') {
      if (!nightResultsByRound.has(log.round)) {
        nightResultsByRound.set(log.round, []);
      }
      nightResultsByRound.get(log.round)!.push(cleanLogMessage(log.message, state));
    }
  }

  // 构建 roundSummaries 的快速查找 Map
  const summaryMap = new Map<number, string>();
  for (const s of state.roundSummaries) {
    summaryMap.set(s.round, s.summary);
  }

  const allRounds = new Set<number>();
  messagesByRound.forEach((_, r) => allRounds.add(r));
  voteResultsByRound.forEach((_, r) => allRounds.add(r));
  nightResultsByRound.forEach((_, r) => allRounds.add(r));
  // 也把已有摘要的轮次加入
  summaryMap.forEach((_, r) => allRounds.add(r));

  if (allRounds.size === 0) return '（游戏刚开始，暂无历史记录）';

  const sortedRounds = [...allRounds].sort((a, b) => a - b);
  const parts: string[] = [];

  for (const round of sortedRounds) {
    const isCurrentRound = round === currentRound;
    const roundLabel = isCurrentRound ? `第 ${round + 1} 轮（本轮）` : `第 ${round + 1} 轮`;
    parts.push(`\n### ${roundLabel}`);

    // 夜晚结果（所有轮次都显示）
    const nightMsgs = nightResultsByRound.get(round);
    if (nightMsgs && nightMsgs.length > 0) {
      parts.push('**夜晚结果：**');
      parts.push(nightMsgs.map(m => `  - ${m}`).join('\n'));
    }

    // 讨论发言：当前轮完整显示，历史轮显示 AI 摘要
    const msgs = messagesByRound.get(round);
    if (msgs && msgs.length > 0) {
      if (isCurrentRound) {
        // 当前轮：显示完整发言，标记自己的发言
        parts.push('**讨论发言：**');
        parts.push(msgs.map(m => {
          const isSelf = selfPlayerId !== undefined && m.playerId === selfPlayerId;
          const cleanName = m.playerName.replace(/\(你\)$/, '');
          const selfLabel = isSelf ? '【你自己】' : '';
          return `  - ${cleanName}${selfLabel}：${m.content}`;
        }).join('\n'));
      } else {
        // 历史轮次：优先使用 AI 生成的摘要
        const summary = summaryMap.get(round);
        if (summary) {
          parts.push(`**讨论摘要：** ${summary}`);
        } else {
          // 兜底：完整显示历史发言（不再截断），标记自己的发言
          const preview = msgs.map(m => {
            const isSelf = selfPlayerId !== undefined && m.playerId === selfPlayerId;
            const cleanName = m.playerName.replace(/\(你\)$/, '');
            const selfLabel = isSelf ? '【你自己】' : '';
            return `${cleanName}${selfLabel}：${m.content}`;
          }).join('\n');
          parts.push(`**讨论发言：**\n${preview}`);
        }
      }
    }

    // 投票结果（所有轮次都显示，这对判断阵营很重要）
    const voteMsgs = voteResultsByRound.get(round);
    if (voteMsgs && voteMsgs.length > 0) {
      parts.push('**投票结果：**');
      parts.push(voteMsgs.map(m => `  - ${m}`).join('\n'));
    }
  }

  return parts.join('\n');
}

// 获取历史讨论摘要（用于快速上下文）
function getDiscussionSummary(state: GameState, maxMessages: number = 10): string {
  // 只取当前轮的讨论（历史轮次由 getRoundHistory 负责）
  const currentRound = state.round;
  const currentRoundMessages = state.discussionMessages.filter(m => m.round === currentRound);
  const recent = currentRoundMessages.slice(-maxMessages);
  if (recent.length === 0) return '（还没有人发言）';
  return recent.map(m => {
    const cleanName = m.playerName.replace(/\(你\)$/, '');
    return `${cleanName}：${m.content}`;
  }).join('\n');
}

// 获取游戏日志摘要（清理人类玩家名中的 (你)）
function getGameLogsSummary(state: GameState, maxLogs: number = 8): string {
  const recent = [...state.logs]
    .filter(l => l.phase === 'night-result' || l.phase === 'day-result')
    .slice(-maxLogs);
  if (recent.length === 0) return '（游戏刚开始）';
  return recent.map(l => `- ${cleanLogMessage(l.message, state)}`).join('\n');
}

/** 清理日志消息中的人类玩家名（去掉 (你) 后缀） */
function cleanLogMessage(message: string, state: GameState): string {
  let cleaned = message;
  // 找到人类玩家并替换
  const humanPlayer = state.players.find(p => !p.isAI);
  if (humanPlayer) {
    cleaned = cleaned.replace(new RegExp(humanPlayer.name.replace(/[()]/g, '\\$&'), 'g'), getAIName(humanPlayer));
  }
  return cleaned;
}

// ============ 玩家行动历史（让 AI 知道自己的历史操作） ============

/**
 * 为特定玩家构建其角色的历史行动摘要
 * 狼人：每轮杀了谁，成功/失败
 * 预言家：每轮查验了谁，结果是什么
 * 女巫：每轮救了谁/毒了谁
 * 守卫：每轮守护了谁
 */
function buildPlayerActionHistory(state: GameState, player: Player): string {
  const history: string[] = [];

  // === 预言家：从 seerCheckHistory 读取（更可靠） ===
  if (player.role === 'seer') {
    for (const record of state.seerCheckHistory || []) {
      const target = state.players.find(p => p.id === record.targetId);
      if (target) {
        history.push(`第 ${record.round + 1} 轮：查验了「${getAIName(target)}」，他是${record.isWerewolf ? '🐺 狼人' : '👤 好人'}`);
      }
    }
    // 当前轮次未入库的查验
    if (state.seerCheckTargetId) {
      const target = state.players.find(p => p.id === state.seerCheckTargetId);
      const alreadyLogged = history.some(h => h.includes(`第 ${state.round + 1} 轮`));
      if (target && !alreadyLogged) {
        history.push(`第 ${state.round + 1} 轮：查验了「${getAIName(target)}」，他是${target.role === 'werewolf' ? '🐺 狼人' : '👤 好人'}`);
      }
    }
  }

  // === 狼人/女巫/守卫/猎人：从 nightActions 读取 ===
  if (player.role === 'werewolf' || player.role === 'witch' || player.role === 'guard' || player.role === 'hunter') {
    const actions = state.nightActions || [];
    for (const action of actions) {
      if (action.actorId !== player.id) continue; // 只看自己的行动

      if (player.role === 'werewolf' && action.phase === 'night-werewolf') {
        history.push(`第 ${action.round + 1} 轮：刀了「${action.targetName || '未知'}」`);
      }
      if (player.role === 'witch') {
        if (action.action === '使用解药救人') {
          history.push(`第 ${action.round + 1} 轮：使用解药救活了「${action.targetName || '未知'}」`);
        } else if (action.action === '使用毒药') {
          history.push(`第 ${action.round + 1} 轮：使用毒药毒杀了「${action.targetName || '未知'}」`);
        }
      }
      if (player.role === 'guard' && action.phase === 'night-guard') {
        const result = action.action.includes('失败') ? '（可能未生效）' : '';
        history.push(`第 ${action.round + 1} 轮：守护了「${action.targetName || '未知'}」${result}`);
      }
      if (player.role === 'hunter' && action.actorRole === 'hunter') {
        history.push(`第 ${action.round + 1} 轮：开枪带走了「${action.targetName || '未知'}」`);
      }
    }

    // 补充 werewolf kill result（刀人是否成功）
    if (player.role === 'werewolf') {
      for (const log of state.logs) {
        if (log.phase !== 'night-result') continue;
        const existingRound = history.find(h => h.includes(`第 ${log.round + 1} 轮结果`));
        if (existingRound) continue;
        if (log.message.includes('平安夜') || log.message.includes('无人死亡')) {
          history.push(`第 ${log.round + 1} 轮结果：击杀失败（平安夜）`);
        } else {
          const match = log.message.match(/昨晚，(.+?) 死了/);
          if (match) {
            history.push(`第 ${log.round + 1} 轮结果：击杀成功（${match[1]} 死亡）`);
          }
        }
      }
    }
  }

  if (history.length === 0) {
    return '（暂无操作记录）';
  }

  return history.join('\n');
}

// ============ 夜晚行动 - 构建每个 AI 角色的上下文 ============

/**
 * 为狼人 AI 构建夜晚击杀选择的上下文
 * 狼人知道：自己的身份、狼队友是谁、存活玩家列表、之前的讨论和日志
 * 狼人不知道：其他玩家的具体身份
 */
function buildWerewolfNightContext(state: GameState, player: Player): string {
  // 你的狼队友（包含已死亡的）
  const werewolfTeammates = state.players.filter(
    p => p.role === 'werewolf' && p.id !== player.id
  );

  const alivePlayers = state.players.filter(p => p.isAlive);

  return `## 当前游戏状态

### 本轮：第 ${state.round + 1} 轮 - 夜晚阶段（狼人行动）

### 你的狼队友：
${werewolfTeammates.length > 0
  ? werewolfTeammates.map(w => `- ${getAIName(w)}${w.isAlive ? '（存活）' : '（已死亡）'}`).join('\n')
  : '（你是唯一的狼人，没有队友）'}

### 你的历史操作：
${buildPlayerActionHistory(state, player)}

### 可击杀的目标（所有存活玩家，含狼队友和自己）：
${alivePlayers.map(p => `- ${getAIName(p)}`).join('\n')}

### 已淘汰玩家：
${state.players.filter(p => !p.isAlive).length > 0
  ? state.players.filter(p => !p.isAlive).map(p => `- ${getAIName(p)}`).join('\n')
  : '（暂无）'}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}

---
现在请你选择今晚要击杀的目标（⚠️ 必须选一个存活玩家，狼人不能空刀）。可自刀骗解药。
请只回复玩家的名字，不要包含其他内容。例如：1号`;
}

// ============ 轮次讨论摘要生成 ============

/**
 * 调用大模型对已完成轮次的讨论发言进行摘要总结
 * 减少大模型上下文长度，避免过多历史信息导致混乱
 * 如果有玩家跳身份（声称自己是预言家/女巫/猎人/守卫等），摘要必须包含该身份信息
 */
export async function generateRoundSummary(state: GameState, round: number): Promise<string> {
  if (!isAIConfigured()) {
    // 无 API 配置时，生成简单摘要
    return generateFallbackSummary(state, round);
  }

  const roundMessages = state.discussionMessages.filter(m => m.round === round);
  if (roundMessages.length === 0) return '（本轮无讨论发言）';

  // 提取该轮的夜晚结果和投票结果
  const nightResults: string[] = [];
  const voteResults: string[] = [];
  for (const log of state.logs) {
    if (log.round !== round) continue;
    const cleaned = cleanLogMessage(log.message, state);
    if (log.phase === 'night-result') {
      nightResults.push(cleaned);
    } else if (log.phase === 'day-result') {
      voteResults.push(cleaned);
    }
  }

  // 构建发言记录
  const discussionText = roundMessages.map(m => {
    const cleanName = m.playerName.replace(/\(你\)$/, '');
    return `${cleanName}：${m.content}`;
  }).join('\n');

  const prompt = `# 狼人杀第 ${round + 1} 轮讨论摘要任务

请将以下狼人杀一轮的完整讨论发言，**压缩总结为一段200字以内的简洁摘要**。

## 该轮夜晚结果：
${nightResults.length > 0 ? nightResults.map(r => `- ${r}`).join('\n') : '（无特殊事件）'}

## 该轮所有讨论发言：
${discussionText}

## 该轮投票结果：
${voteResults.length > 0 ? voteResults.map(r => `- ${r}`).join('\n') : '（无投票记录）'}

---
### 摘要要求：
1. 用中文总结本轮发生了哪些关键事件
2. 总结各玩家的主要观点和立场（谁被怀疑、谁被信任）
3. ⚠️ **如果有玩家主动声称了某身份（跳身份，例如声称自己是预言家/女巫/猎人/守卫等），必须在摘要中明确标注该玩家和其声称的身份**
4. 如果没有任何玩家跳身份，则不需要涉及身份信息
5. 摘要要简洁客观，只陈述事实，不做推理推断
6. 最终投票结果的详情必须包含
7. 字数控制在200字以内

请直接输出摘要文本，不需要任何格式标记或额外说明。`;

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一个狼人杀游戏的轮次总结助手。请根据提供的讨论发言和游戏事件，生成简洁客观的轮次摘要。特别注意标注任何玩家跳身份的信息。' },
      { role: 'user', content: prompt },
    ];
    const response = await callLLM(messages, 0.3);
    return response.trim() || generateFallbackSummary(state, round);
  } catch {
    // API 调用失败时回退到简单摘要
    return generateFallbackSummary(state, round);
  }
}

/** 无大模型时生成的兜底摘要 */
export function generateFallbackSummary(state: GameState, round: number): string {
  const roundMessages = state.discussionMessages.filter(m => m.round === round);
  if (roundMessages.length === 0) return '（本轮无讨论发言）';

  // 提取关键信息
  const nightResults: string[] = [];
  const voteResults: string[] = [];
  for (const log of state.logs) {
    if (log.round !== round) continue;
    if (log.phase === 'night-result') {
      nightResults.push(cleanLogMessage(log.message, state));
    } else if (log.phase === 'day-result') {
      voteResults.push(cleanLogMessage(log.message, state));
    }
  }

  // 检测跳身份关键词
  const identityClaims: string[] = [];
  for (const m of roundMessages) {
    const cleanName = m.playerName.replace(/\(你\)$/, '');
    const content = m.content;
    if (/我是预言家|我是女巫|我是猎人|我是守卫|我是白痴|跳预言家|跳女巫|跳猎人|跳守卫|报身份.*预言家|报身份.*女巫|我的身份是/.test(content)) {
      identityClaims.push(`${cleanName}声称自己是特定身份`);
    }
  }

  const parts: string[] = [];
  parts.push(`本回合共${roundMessages.length}条发言`);
  if (nightResults.length > 0) {
    parts.push(`夜晚：${nightResults.join('，')}`);
  }
  if (identityClaims.length > 0) {
    parts.push(`⚠️ 有玩家跳身份：${identityClaims.join('；')}`);
  }
  if (voteResults.length > 0) {
    parts.push(`投票结果：${voteResults.join('，')}`);
  }
  return parts.join('。') + '。';
}

/**
 * 为 AI 狼人构建投票上下文（人类狼人已投票的场景）
 * 告诉 AI 狼人人类玩家已经投了谁，让 AI 狼人也投票
 */
export function buildWerewolfNightVoteContext(
  state: GameState,
  player: Player,
  humanName: string,
  humanTargetId: string,
): string {
  const werewolfTeammates = state.players.filter(
    p => p.role === 'werewolf' && p.id !== player.id
  );
  const alivePlayers = state.players.filter(p => p.isAlive);
  const humanTarget = state.players.find(p => p.id === humanTargetId);
  const cleanHumanName = humanName.replace(/\(你\)$/, '');

  return `## 当前游戏状态

### 本轮：第 ${state.round + 1} 轮 - 夜晚阶段（狼人行动）

### 你的狼队友：
${werewolfTeammates.length > 0
  ? werewolfTeammates.map(w => `- ${getAIName(w)}${w.isAlive ? '（存活）' : '（已死亡）'}`).join('\n')
  : '（你是唯一的狼人，没有队友）'}

### 你的历史操作：
${buildPlayerActionHistory(state, player)}

### 可击杀的目标（所有存活玩家，含狼队友和自己）：
${alivePlayers.map(p => `- ${getAIName(p)}`).join('\n')}

### ⚠️ 注意：你的狼队友「${cleanHumanName}」已经投票要击杀「${getAIName(humanTarget || state.players[0])}」。
### 你可以选择跟票，也可以根据自己的判断选择不同的目标。
### 最终目标将由所有狼人投票决定，得票最多者将被击杀。

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}

---
现在请你投票选择今晚要击杀的目标（可自刀）。
请只回复玩家的名字，不要包含其他内容。例如：1号`;
}

/**
 * 为预言家 AI 构建查验选择的上下文
 * 预言家知道：自己的身份、之前查验过的结果、存活玩家
 * 预言家不知道：其他玩家的具体身份
 */
function buildSeerNightContext(state: GameState, player: Player): string {
  // 从持久化的 seerCheckHistory 获取已查验记录（比解析日志更可靠）
  const checkedIds = new Set<string>();
  const checkedDetails: string[] = [];
  for (const record of state.seerCheckHistory || []) {
    const target = state.players.find(p => p.id === record.targetId);
    if (target) {
      checkedIds.add(record.targetId);
      checkedDetails.push(`第${record.round + 1}轮: 查验了 ${getAIName(target)}，结果是：${record.isWerewolf ? '狼人' : '好人'}`);
    }
  }
  // 当前轮次如果已有查验目标（防止重复查验）
  if (state.seerCheckTargetId) {
    checkedIds.add(state.seerCheckTargetId);
  }

  const allAlive = state.players.filter(p => p.isAlive && p.id !== player.id);
  // 未查验过的存活玩家（优先选择）
  const unchecked = allAlive.filter(p => !checkedIds.has(p.id));
  // 已查验过的存活玩家
  const alreadyChecked = allAlive.filter(p => checkedIds.has(p.id));

  return `## 当前游戏状态

### 本轮：第 ${state.round + 1} 轮 - 夜晚阶段（预言家行动）

### 📋 你已查验过的玩家（不要重复查验）：
${checkedDetails.length > 0 ? checkedDetails.join('\n') : '（尚未查验过任何玩家）'}

### ✅ 尚未查验的存活玩家（请从以下玩家中选择）：
${unchecked.length > 0
  ? unchecked.map(p => `- ${getAIName(p)}`).join('\n')
  : '（所有存活玩家都已查验过）'}

${alreadyChecked.length > 0 ? `### ⚠️ 已查验过的存活玩家（不要再查验他们）：
${alreadyChecked.map(p => `- ${getAIName(p)}`).join('\n')}` : ''}

### 所有存活玩家：
${state.players.filter(p => p.isAlive).map(p => `- ${getAIName(p)}`).join('\n')}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}

---
现在请你从【尚未查验的存活玩家】中选择一个目标进行查验。
⚠️ 重要：请务必选择尚未查验过的玩家，不要重复查验已查验过的玩家。
请只回复玩家的名字，不要包含其他内容。例如：1号`;
}

/**
 * 为女巫 AI 构建用药决策的上下文
 * 女巫知道：自己的身份、解药/毒药状态、谁被狼人杀害了
 * 女巫不知道：其他玩家的具体身份
 */
function buildWitchNightContext(state: GameState, player: Player): string {
  const killedPlayer = state.werewolfTargetId
    ? state.players.find(p => p.id === state.werewolfTargetId)
    : null;

  return `## 当前游戏状态

### 本轮：第 ${state.round + 1} 轮 - 夜晚阶段（女巫行动）

### 你的药水状态：
- 解药：${player.hasAntidote ? '✅ 可用' : '❌ 已使用'}
- 毒药：${player.hasPoison ? '✅ 可用' : '❌ 已使用'}

### 你的历史操作：
${buildPlayerActionHistory(state, player)}

${player.hasAntidote && killedPlayer
  ? `### 昨晚死亡的玩家（被狼人选为击杀目标）：${getAIName(killedPlayer)}

${killedPlayer.id === player.id
  ? `⚠️ **死的玩家就是你自己！** 你必须立即使用解药自救！如果你死了，好人阵营直接损失一个神职，非常不利。你没有理由不救自己。`
  : `你需要决定是否使用解药救活「${getAIName(killedPlayer)}」。强烈建议使用解药救人——你不知道这个玩家是不是预言家或其他关键神职。`}`
  : player.hasAntidote
    ? '### 昨晚没有人死亡（可能是平安夜）。'
    : '### ⚠️ 你的解药已经用掉了，无法得知当晚的击杀目标（不知道刀口）。'}

### 所有存活玩家：
${state.players.filter(p => p.isAlive).map(p => `- ${getAIName(p)}`).join('\n')}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}

---
现在请你做出决定：
1. 是否使用解药救人？（⚠️ 被杀的如果是你自己，你有解药就一定要自救！${!player.hasAntidote ? '你的解药已用掉，无法使用。' : ''}）
2. 是否使用毒药毒杀某人？（谨慎使用，不要随便毒人）
请用以下JSON格式回复（只回复JSON，不要其他内容）：
{"useAntidote": ${player.hasAntidote ? 'true/false' : 'false'}, "usePoison": true/false, "poisonTarget": "玩家名或null"}`;
}

/**
 * 为守卫 AI 构建守护选择的上下文
 * 守卫知道：自己的身份、上次守护了谁、存活玩家
 * 守卫不知道：其他玩家的具体身份
 */
function buildGuardNightContext(state: GameState, player: Player): string {
  const lastGuarded = player.lastGuardedId
    ? state.players.find(p => p.id === player.lastGuardedId)
    : null;

  const candidates = state.players.filter(
    p => p.isAlive &&
      p.id !== player.lastGuardedId  // 不能连续守护同一人
  );

  return `## 当前游戏状态

### 本轮：第 ${state.round + 1} 轮 - 夜晚阶段（守卫行动）

### 上次守护的玩家：${lastGuarded ? getAIName(lastGuarded) + '（不能连续守护）' : '（这是你第一次行动）'}

### 你的历史操作：
${buildPlayerActionHistory(state, player)}

### 可守护的存活玩家：
${candidates.map(p => `- ${getAIName(p)}`).join('\n')}

### 所有存活玩家：
${state.players.filter(p => p.isAlive).map(p => `- ${getAIName(p)}`).join('\n')}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}

---
现在请你选择要守护的目标。
请只回复玩家的名字，不要包含其他内容。例如：1号`;
}

// ============ 白天讨论 - 构建 AI 发言上下文 ============

/**
 * 为 AI 玩家构建白天讨论的上下文
 * 根据角色给予不同的信息
 */
function buildDiscussionContext(state: GameState, player: Player): string {
  // 基础信息：所有玩家都知道的
  let context = `## 当前游戏状态

### 第 ${state.round + 1} 轮 - 白天讨论阶段

### 昨夜情况：`;

  // 收集当前轮所有夜间死亡的玩家
  const nightDeathNames: string[] = [];
  for (const log of state.logs) {
    if (log.round === state.round && log.phase === 'night-result') {
      const match = log.message.match(/昨晚，(.+?) 死了/);
      if (match) {
        nightDeathNames.push(match[1]);
      }
    }
  }
  if (nightDeathNames.length > 0) {
    const uniqueNames = [...new Set(nightDeathNames)];
    context += `\n${uniqueNames.join(' 和 ')} 死了。`;
  } else {
    context += `\n昨晚是平安夜，无人死亡。`;
  }

  context += `\n\n### 所有存活玩家：
${state.players.filter(p => p.isAlive).map(p => `- ${getAIName(p)}`).join('\n')}

### 已淘汰玩家：
${state.players.filter(p => !p.isAlive).length > 0
  ? state.players.filter(p => !p.isAlive).map(p => `- ${getAIName(p)}`).join('\n')
  : '（暂无）'}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}
`;

  // 角色专属信息 - 包含完整历史操作
  if (player.role === 'werewolf') {
    const teammates = state.players.filter(
      p => p.role === 'werewolf' && p.id !== player.id
    );
    context += `\n\n### 🔒 只有你知道的信息（绝对不能泄露！）：
- 你是狼人，你的狼队友是：${teammates.length > 0 ? teammates.map(w => `${getAIName(w)}${w.isAlive ? '' : '（已死亡）'}`).join('、') : '（你是唯一的狼人）'}
- 你需要在发言中伪装成好人，引导大家投错票。
- ⚠️ 绝对不能暴露你是狼人！不能说"我们狼人""刀人""击杀""队友"等词！
- ⚠️ 绝对不能说任何夜晚行动相关的信息！
- ⚠️ 如果必须报身份，只能说"村民"或其他好人身份。
- 发言要有策略：分析讨论记录中其他玩家的发言，找出好人的漏洞，把嫌疑引到好人身上。
- 可以假装认同某个好人的观点，或者质疑某个好人的推理。
- ⚠️ 但要小心不要攻击你的狼队友！
- 🎭 你可以伪装成神职（假跳预言家报假查验、假跳女巫混淆视线），这是狼人阵营的重要战术。
- 如果你伪装成神职，发言要像真的神职一样自然，报出具体的假信息，但不要前后矛盾。

### 📋 你的历史操作记录（仅供你自己参考，绝对不能说出来）：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'seer') {
    context += `\n\n### 🔒 只有你知道的信息：

### 📋 你的历史查验记录：
${buildPlayerActionHistory(state, player)}

### 🎯 发言策略：
- 如果你查验出了狼人，应该在讨论中跳预言家身份，公开你的查验结果，带领好人投票。
- 如果你前几轮查验的都是好人，可以选择继续隐藏身份继续查验，也可以跳身份澄清查验过的好人。
- 跳身份的时机很重要：第二轮及以后通常应该跳身份；如果第一轮就查到狼人，更应该立即跳身份。
- 分析讨论记录中其他玩家的发言，结合你的查验结果找出矛盾之处。
- 如果有人跳预言家报出和你不一样的查验结果，基本可以断定对方是狼人或狼人假跳，应该坚决反驳。`;
  }

  if (player.role === 'witch') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你的解药：${player.hasAntidote ? '✅ 可用' : '❌ 已使用'}
- 你的毒药：${player.hasPoison ? '✅ 可用' : '❌ 已使用'}

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}

### 🎯 发言策略：
- 你掌握额外的死亡信息，可以在讨论中用隐晦的方式表达你的判断。
- 如果你用解药救过人，知道那个人是好人，可以在他被人怀疑时帮忙说话。
- 如果局势对好人不利（比如已经有神职死亡），可以考虑跳女巫身份来稳定局势，报出你的用药情况。
- 分析讨论记录中其他玩家的发言，结合你知道的信息找出谁最可疑。`;
  }

  if (player.role === 'guard') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你昨晚守护了：${state.guardProtectTargetId ? getAIName(state.players.find(p => p.id === state.guardProtectTargetId)!) : '无人'}

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}

### 🎯 发言策略：
- 前期可以保持低调，像普通村民一样参与推理讨论，保护好自己。
- 如果已经有其他神职跳了身份，你可以选择继续隐藏。
- 如果好人阵营陷入混乱、没有神职带队，你应该考虑跳守卫身份来提供信息、稳定局势。
- 分析讨论记录中其他玩家的发言，找出逻辑漏洞和可疑行为。
- 如果有人明显在带节奏，那很可能是狼人。`;
  }

  if (player.role === 'hunter') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你是猎人，如果你被投票放逐或被狼人杀害，可以开枪带走一名玩家。
- ⚠️ 夜晚死亡开枪无声（不暴露猎人身份），白天被放逐开枪会公开猎人和目标。
- 考虑好如果要出局时带谁走，但平时发言保持自然。

### 🎯 发言策略：
- 作为强神，你的发言可以更自信，不怕被人怀疑。
- 可以考虑跳猎人身份，明确告诉大家你是猎人、不怕被抗推，这样既能证明好身份，也能避免被预言家浪费查验。
- 如果已经有多个神职跳出，你可以在旁边辅助分析，不一定要跳身份。
- 分析讨论记录中其他玩家的发言，找出谁在刻意引导舆论。`;
  }

  if (player.role === 'villager') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你是普通村民，没有特殊技能，你唯一的武器就是推理和观察。
- 通过推理和投票帮助好人阵营找出狼人。

### 🎯 发言策略：
- 仔细分析讨论记录中每个人的发言，寻找逻辑矛盾、前后不一致、过度带节奏的玩家。
- 对可疑的发言提出质疑，要求对方解释。
- 不要盲目跟风，要有自己的独立判断。
- 如果有人主动报出神职身份，先保持怀疑（狼人也可能伪装），观察后续发展，也可以报出自己的身份（村民）。
- 你也可以伪装成神职（比如假跳预言家/女巫）来挡刀保护真神职，但注意不要引起混乱。`;
  }

  context += `\n\n---
现在请你发表你的看法（2-4句话，简洁自然）。注意：
- ⚠️ 请仔细阅读上面「📜 历史轮次回顾」中其他玩家本轮和往轮的发言，你的发言需要基于这些讨论记录来进行分析和回应！
- 你可以回应或反驳其他玩家对你的怀疑，也可以指出其他玩家发言中的矛盾之处。
- 可以引用具体玩家之前的发言来分析（例如"上一轮X号说...但我认为..."）。
- ⚠️ 如果你是狼人，必须伪装成好人发言！绝对不能提到任何夜晚行动、狼队友、刀人/杀人等信息！你可以说自己是村民或其他神职（假跳身份）。
- 💡 这局游戏中你和你的角色都应该考虑：或真或假地表露一个身份（你可以说"我是村民"、也可以报出一个神职身份，无论是真是假），让游戏更有趣、更像真实狼人杀。
- 🎭 如果你是好人神职，可以在合适时机跳身份带队；如果你是村民，可以报村民身份，也可以假装神职挡刀；如果你是狼人，必须伪造成好人身份。
- 发言要像真实玩家的口语表达，不要像在写论文。
- 可以质疑、分析、提问，也可以表达不确定。`;

  return context;
}

// ============ 白天投票 - 构建 AI 投票上下文 ============

function buildVoteContext(state: GameState, player: Player): string {
  const candidates = state.players.filter(
    p => p.isAlive && p.id !== player.id
  );

  let context = `## 当前游戏状态

### 第 ${state.round + 1} 轮 - 投票放逐阶段

### 可投票的存活玩家：
${candidates.map(p => `- ${getAIName(p)}`).join('\n')}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}
`;

  // 角色专属信息
  if (player.role === 'werewolf') {
    const teammates = state.players.filter(
      p => p.role === 'werewolf' && p.id !== player.id
    );
    context += `\n\n### 🔒 只有你知道的信息：
- 你是狼人，你的狼队友是：${teammates.length > 0 ? teammates.map(w => `${getAIName(w)}${w.isAlive ? '' : '（已死亡）'}`).join('、') : '（你是唯一的狼人）'}

### 🎯 狼人投票策略：
- 你的目标是淘汰好人阵营，可以利用投票达到目的
- 投票给好人：这是最直接的策略，帮助减少好人数
- 投票给狼队友：可以作为伪装，避免被怀疑
- 投票给被怀疑的玩家：跟随舆论趋势，让自己的行为看起来像好人
- ⚠️ 不要投票给明显是狼队友的玩家如果这样做会暴露你的身份
- 基于狼人立场，优先票走预言家、女巫等关键神职

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'seer') {
    context += `\n\n### 🔒 只有你知道的信息：

### 🎯 预言家投票策略：
- 如果你查验出了狼人，应优先投票给他
- 如果你查验出的都是好人，可以通过讨论中的言行来判断谁最可疑
- 不要投票给你查验过确定是好人的玩家
- 如果你还未暴露身份，注意保护自己，不要过早跳身份

### 📋 你的历史查验记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'witch') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你的解药：${player.hasAntidote ? '✅ 可用' : '❌ 已使用'}
- 你的毒药：${player.hasPoison ? '✅ 可用' : '❌ 已使用'}

### 🎯 女巫投票策略：
- 你知道昨晚的死亡情况，可以据此判断场上局势
- 如果你救过人，那个人大概率是好人
- 投票给讨论中表现最可疑的玩家
- 你拥有毒药可以作为后手，白天投票可以更激进一些

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'guard') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你昨晚守护了：${state.guardProtectTargetId ? getAIName(state.players.find(p => p.id === state.guardProtectTargetId)!) : '无人'}

### 🎯 守卫投票策略：
- 你没有查验能力，需要通过讨论发言来判断狼人
- 投票给讨论中言行最可疑的玩家
- 保护好自己，不要暴露守卫身份

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'hunter') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你是猎人，被放逐或杀害时可以开枪带走一人
- 夜晚死亡开枪无声，白天被放逐开枪会公开猎人和目标

### 🎯 猎人投票策略：
- 作为强神，你的发言可以更强势
- 投票给讨论中表现最可疑的玩家
- 即使被怀疑也不要慌张，你的死亡可以为好人阵营做贡献
- 观察场上谁在刻意引导舆论，那可能是狼人`;
  }

  if (player.role === 'villager') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你是普通村民，没有特殊技能

### 🎯 村民投票策略：
- 仔细分析每个人的发言，寻找逻辑矛盾和异常行为
- 不要盲目跟票，要有自己的独立判断
- 如果有人在讨论中引导舆论、转移话题，那可能是狼人
- 投票给讨论中表现最可疑、逻辑最混乱或最像狼人的玩家
- 你的每一票都很关键，好人的胜利取决于你！`;
  }

  context += `\n\n---
请根据上面的讨论记录（📜 历史轮次回顾）和你的角色信息，选出你认为最应该被放逐的玩家。
⚠️ 你的投票必须基于讨论中表现出的可疑行为，不能无理由随机投票！
⚠️ 在讨论记录中，你自己的发言已标注为【你自己】，请勿投票给自己！

请简要说明投票理由（不超过30字，要具体，不能只说"可疑"，要说清楚哪里可疑）。

请严格按照以下格式回复：
玩家名字|投票理由

如果要弃票请回复：
弃票

例如：1号|他发言前后矛盾，一直在转移话题`;

  return context;
}

// ============ 平票补发言 - 构建 AI 补发言上下文 ============

function buildTieSpeechContext(state: GameState, player: Player): string {
  const otherTiedIds = state.tiePlayerIds.filter(id => id !== player.id);
  const otherTiedNames = otherTiedIds.map(id => {
    const p = state.players.find(pl => pl.id === id);
    return p ? getAIName(p) : '未知';
  }).join('、');

  let context = `## 当前游戏状态

### 第 ${state.round + 1} 轮 - ⚖️ 平票补充发言阶段

### 投票结果：
上一轮投票你和 ${otherTiedNames} 获得了相同的票数（平票）。
现在需要你来补充发言为自己辩护，之后其他玩家会重新投票。

### 和你平票的玩家：
${otherTiedNames ? `${otherTiedNames}` : '（只有你一人？这种情况不应该出现）'}

### 所有存活玩家：
${state.players.filter(p => p.isAlive).map(p => `- ${getAIName(p)}`).join('\n')}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}
`;

  // 角色专属信息
  if (player.role === 'werewolf') {
    const teammates = state.players.filter(
      p => p.role === 'werewolf' && p.id !== player.id
    );
    context += `\n\n### 🔒 只有你知道的信息（绝对不能泄露！）：
- 你是狼人，你的狼队友是：${teammates.length > 0 ? teammates.map(w => `${getAIName(w)}${w.isAlive ? '' : '（已死亡）'}`).join('、') : '（你是唯一的狼人）'}
- ⚠️ 你正在被怀疑！你需要为自己辩护！
- ⚠️ 绝对不能暴露你是狼人！不能说"我们狼人""刀人""击杀""队友"等词！
- ⚠️ 绝对不能说任何夜晚行动相关的信息！
- 为自己辩护时要自然，可以：
  * 分析为什么别人投票给你（可能被狼人带节奏）
  * 指出其他平票玩家更可疑的地方
  * 强调自己的好人身份

### 📋 你的历史操作记录（仅供你自己参考，绝对不能说出来）：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'seer') {
    context += `\n\n### 🔒 只有你知道的信息：

### 🎯 预言家平票辩护策略：
- 你被平票了，需要为自己辩护
- 如果你查验了关键信息而且信任度不够，可以考虑现在报出自己的查验结果来证明身份
- 如果你已经暴露了身份且查验出了狼人，指出狼人信息
- 分析为什么狼人可能在引导投票给你

### 📋 你的历史查验记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'witch') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你的解药：${player.hasAntidote ? '✅ 可用' : '❌ 已使用'}
- 你的毒药：${player.hasPoison ? '✅ 可用' : '❌ 已使用'}

### 🎯 女巫平票辩护策略：
- 你被平票了，需要为自己辩护
- 如果情况危急，可以考虑跳身份自证
- 分析为什么有人在引导投票给你
- 指出其他平票玩家可疑的地方

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'guard') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你昨晚守护了：${state.guardProtectTargetId ? getAIName(state.players.find(p => p.id === state.guardProtectTargetId)!) : '无人'}

### 🎯 守卫平票辩护策略：
- 你被平票了，需要为自己辩护
- 分析投票逻辑，找出谁在带节奏
- 如果没有更好的线索，可以分析其他平票玩家的发言

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'hunter') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你是猎人，被投票出局时可以开枪带走一人
- 夜晚死亡开枪无声，白天被放逐开枪会公开猎人和目标
- 你不怕被投票出局，但也要为自己辩护

### 🎯 猎人平票辩护策略：
- 你被平票了，但作为猎人你并不怕出局
- 可以强硬表态，让别人重新考虑投票
- 注意观察谁在极力想推你出局，那很可能是狼人`;

  }

  if (player.role === 'villager') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你是普通村民，没有特殊技能
- 你被平票了，需要为自己辩护

### 🎯 村民平票辩护策略：
- 仔细分析本轮讨论中谁最可疑
- 指出其他平票玩家的可疑之处
- 分析为什么好人不应该投你
- 你的发言可能决定你的生死！`;
  }

  context += `\n\n---
⚖️ 你现在处于平票阶段，需要为自己补充辩护。请发表2-4句话的简短辩护，说服其他玩家不要投你。

注意：
- 为自己辩护，说清楚你为什么不是狼人，给出具体理由
- 回顾讨论记录中其他玩家的发言，指出其中不合逻辑或可疑的地方
- 可以指出其他平票玩家更可疑的地方，引用他们之前发言中的矛盾
- 保持自然的口语表达，不要像在写论文
- 不要泄露你的角色私密信息（如狼队友、查验结果等），除非你确信需要跳身份`;

  return context;
}

// ============ 平票补投 - 构建 AI 补投票上下文 ============

function buildTieVoteContext(state: GameState, player: Player): string {
  const tiedPlayers = state.tiePlayerIds.map(id => {
    const p = state.players.find(pl => pl.id === id);
    return p ? getAIName(p) : '未知';
  }).join('、');

  // 候选人只能是平票玩家
  const candidates = state.players.filter(
    p => p.isAlive && state.tiePlayerIds.includes(p.id) && p.id !== player.id
  );

  let context = `## 当前游戏状态

### 第 ${state.round + 1} 轮 - ⚖️ 平票补投阶段

### 平票玩家（只能投给他们）：
${tiedPlayers}

### 可投票的玩家：
${candidates.map(p => `- ${getAIName(p)}`).join('\n')}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, player.id)}

### ⚖️ 平票补投说明：
上一轮投票出现了平票，平票玩家已经进行了补充发言。现在你必须从平票玩家中选择一人投票放逐，不能弃票！
`;

  // 角色专属信息
  if (player.role === 'werewolf') {
    const teammates = state.players.filter(
      p => p.role === 'werewolf' && p.id !== player.id
    );
    context += `\n\n### 🔒 只有你知道的信息：
- 你是狼人，你的狼队友是：${teammates.length > 0 ? teammates.map(w => `${getAIName(w)}${w.isAlive ? '' : '（已死亡）'}`).join('、') : '（你是唯一的狼人）'}
- ⚠️ 投票给好人，保护狼队友！

### 🎯 狼人投票策略：
- 优先投票给好人而非狼队友
- 如果平票玩家中有狼队友，把票投给另一个平票玩家
- 分析平票玩家的补充发言，投给发言最差、最像好人的（这样好人被票出对狼人有利）

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'seer') {
    context += `\n\n### 🔒 只有你知道的信息：

### 🎯 预言家补投策略：
- 你必须在平票玩家中选择一人投票
- 如果你查验过平票玩家，利用你的查验结果决定投给狼人或保护好人
- 分析平票玩家的补充发言谁更可疑

### 📋 你的历史查验记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'witch') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你的解药：${player.hasAntidote ? '✅ 可用' : '❌ 已使用'}
- 你的毒药：${player.hasPoison ? '✅ 可用' : '❌ 已使用'}

### 🎯 女巫补投策略：
- 你必须在平票玩家中选择一人投票
- 如果你救过某个平票玩家，他大概率是好人，应保护他
- 分析平票玩家的补充发言

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'guard') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你昨晚守护了：${state.guardProtectTargetId ? getAIName(state.players.find(p => p.id === state.guardProtectTargetId)!) : '无人'}

### 🎯 守卫补投策略：
- 你必须在平票玩家中选择一人投票
- 分析平票玩家的补充发言，投给更可疑的

### 📋 你的历史操作记录：
${buildPlayerActionHistory(state, player)}`;
  }

  if (player.role === 'hunter') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你是猎人，被投票出局时可以开枪带走一人
- 夜晚死亡开枪无声，白天被放逐开枪会公开猎人和目标

### 🎯 猎人补投策略：
- 你必须在平票玩家中选择一人投票
- 分析平票玩家的补充发言，投给更可疑的`;
  }

  if (player.role === 'villager') {
    context += `\n\n### 🔒 只有你知道的信息：
- 你是普通村民，没有特殊技能

### 🎯 村民补投策略：
- 你必须在平票玩家中选择一人投票
- 仔细分析平票玩家的补充发言，谁更可疑就投给谁
- 不要盲目跟票，要有独立判断`;
  }

  context += `\n\n---
请根据平票玩家的补充发言和之前的讨论记录，从平票玩家中选择你要投票放逐的人。
⚠️ 仔细分析他们在平票补充发言中的表现，谁更可疑就投谁。
⚠️ 在讨论记录中，你自己的发言已标注为【你自己】，请勿投票给自己！

简要说明投票理由（不超过30字，要具体，引用发言中的矛盾点）。

注意：不能弃票！必须从平票玩家中选择一人！

请严格按照以下格式回复：
玩家名字|投票理由

例如：1号|他的补充发言前后矛盾，逻辑不通`;

  return context;
}

// ============ API 调用函数 ============

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 规范化 API URL：自动补全 /v1/chat/completions 路径
 */
function normalizeApiUrl(url: string): string {
  let trimmed = url.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return trimmed + '/chat/completions';
  if (!trimmed.includes('/chat/completions')) {
    if (trimmed.includes('/v1/')) {
      return trimmed.replace(/\/v1\/.*$/, '') + '/v1/chat/completions';
    }
    return trimmed + '/v1/chat/completions';
  }
  return trimmed;
}

// 模块级变量，存储最近一次 AI 响应的 reasoning_content
let lastReasoningContent: string | null = null;

/** 获取最近一次响应的推理过程文本 */
export function getLastReasoningContent(): string | null {
  return lastReasoningContent;
}

export async function callLLM(messages: ChatMessage[], temperature?: number): Promise<string> {
  const config = getAIConfig();

  if (!config.apiKey) {
    throw new Error('API 密钥未配置，请在设置中配置大模型 API');
  }

  const apiUrl = normalizeApiUrl(config.apiUrl);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: temperature ?? config.temperature,
      extra_body: { enable_thinking: config.thinking },
      chat_template_kwargs: { enable_thinking: config.thinking },
      enable_thinking: config.thinking,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 调用失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const content = message?.content?.trim();
  const reasoning = message?.reasoning_content?.trim();
  
  // 存储推理过程，供外部调试
  lastReasoningContent = reasoning || null;

  if (!content) {
    if (reasoning) {
      // 思考模式: 推理过程消耗了 token，content 为空时用推理过程做后备
      console.warn('[AI] 模型仅返回推理过程，content 为空', reasoning.substring(0, 200));
      throw new Error('API 返回了空内容（推理过程: ' + reasoning.substring(0, 100) + '...）');
    }
    throw new Error('API 返回了空内容');
  }

  return content;
}

// ============ 公开的 AI 行动接口 ============

/**
 * AI 狼人选目标 - 并行调用所有存活狼人，然后统计投票
 * 返回选中的目标玩家 ID
 */
export async function aiWerewolfChooseTarget(state: GameState): Promise<string | null> {
  const aliveWerewolves = state.players.filter(
    p => p.role === 'werewolf' && p.isAlive && p.isAI
  );
  const alivePlayers = state.players.filter(p => p.isAlive);

  if (aliveWerewolves.length === 0 || alivePlayers.length === 0) return null;

  // 如果没有配置 API，使用随机后备方案
  if (!isAIConfigured()) {
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
  }

  // 并行调用所有狼人 AI
  const votes: Map<string, number> = new Map();
  const results = await Promise.allSettled(
    aliveWerewolves.map(async (wolf) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: buildRoleSystemPrompt('werewolf', wolf.name, state) },
        { role: 'user', content: buildWerewolfNightContext(state, wolf) },
      ];

      const response = await callLLM(messages);
      // 从回复中提取玩家名字
      const name = extractPlayerName(response, state);
      return { wolfId: wolf.id, targetName: name };
    })
  );

  // 统计投票
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.targetName) {
      const targetId = findPlayerIdByName(result.value.targetName, state);
      if (targetId) {
        votes.set(targetId, (votes.get(targetId) || 0) + 1);
      }
    }
  }

  // 找到票数最多的目标
  let maxVotes = 0;
  let chosenId: string | null = null;
  const tiedIds: string[] = [];

  for (const [id, count] of votes) {
    if (count > maxVotes) {
      maxVotes = count;
      chosenId = id;
      tiedIds.length = 0;
      tiedIds.push(id);
    } else if (count === maxVotes) {
      tiedIds.push(id);
    }
  }

  // 平票时随机选择
  if (tiedIds.length > 1) {
    chosenId = tiedIds[Math.floor(Math.random() * tiedIds.length)];
  }

  // 如果没有得到有效结果，回退随机
  if (!chosenId) {
    chosenId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
  }

  return chosenId;
}

/**
 * AI 预言家选查验目标
 */
export async function aiSeerChooseTarget(state: GameState): Promise<string | null> {
  const seer = state.players.find(p => p.role === 'seer' && p.isAlive && p.isAI);
  if (!seer) return null;

  const candidates = state.players.filter(p => p.isAlive && p.id !== seer.id);
  if (candidates.length === 0) return null;

  if (!isAIConfigured()) {
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildRoleSystemPrompt('seer', seer.name, state) },
      { role: 'user', content: buildSeerNightContext(state, seer) },
    ];

    const response = await callLLM(messages);
    const name = extractPlayerName(response, state);
    const targetId = findPlayerIdByName(name, state);

    return targetId || candidates[Math.floor(Math.random() * candidates.length)].id;
  } catch {
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }
}

/**
 * AI 女巫用药决策
 */
export async function aiWitchDecide(state: GameState): Promise<{
  useAntidote: boolean;
  usePoison: boolean;
  poisonTargetId: string | null;
}> {
  const witch = state.players.find(p => p.role === 'witch' && p.isAlive && p.isAI);
  if (!witch) {
    return { useAntidote: false, usePoison: false, poisonTargetId: null };
  }

  // 后备策略（无大模型 API 时）
  if (!isAIConfigured()) {
    // 被刀且自己还有解药 → 必定自救
    const isSelfTargeted = state.werewolfTargetId === witch.id;
    const useAntidote = witch.hasAntidote && !!state.werewolfTargetId && (isSelfTargeted || Math.random() < 0.7);
    const usePoison = witch.hasPoison && state.round >= 2 && Math.random() < 0.2;
    let poisonTargetId: string | null = null;
    if (usePoison) {
      const targets = state.players.filter(p => p.isAlive && p.id !== witch.id);
      if (targets.length > 0) {
        poisonTargetId = targets[Math.floor(Math.random() * targets.length)].id;
      }
    }
    return { useAntidote, usePoison, poisonTargetId };
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildRoleSystemPrompt('witch', witch.name, state) },
      { role: 'user', content: buildWitchNightContext(state, witch) },
    ];

    const response = await callLLM(messages);
    // 解析 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      let poisonTargetId: string | null = null;
      if (parsed.usePoison && parsed.poisonTarget && parsed.poisonTarget !== 'null') {
        poisonTargetId = findPlayerIdByName(parsed.poisonTarget, state);
      }
      return {
        useAntidote: parsed.useAntidote === true && witch.hasAntidote,
        usePoison: parsed.usePoison === true && witch.hasPoison && !!poisonTargetId,
        poisonTargetId,
      };
    }
  } catch { /* fallback */ }

  return { useAntidote: false, usePoison: false, poisonTargetId: null };
}

/**
 * AI 守卫选守护目标
 */
export async function aiGuardChooseTarget(state: GameState): Promise<string | null> {
  const guard = state.players.find(p => p.role === 'guard' && p.isAlive && p.isAI);
  if (!guard) return null;

  const candidates = state.players.filter(
    p => p.isAlive && p.id !== guard.lastGuardedId
  );
  if (candidates.length === 0) return null;

  if (!isAIConfigured()) {
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildRoleSystemPrompt('guard', guard.name, state) },
      { role: 'user', content: buildGuardNightContext(state, guard) },
    ];

    const response = await callLLM(messages);
    const name = extractPlayerName(response, state);
    const targetId = findPlayerIdByName(name, state);

    return targetId || candidates[Math.floor(Math.random() * candidates.length)].id;
  } catch {
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }
}

/**
 * AI 白天讨论发言
 */
export async function aiGenerateDiscussion(
  state: GameState,
  player: Player
): Promise<string | null> {
  if (!isAIConfigured()) {
    // 使用后备模板
    return fallbackDiscussion(player, state);
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildRoleSystemPrompt(player.role, player.name, state) },
      { role: 'user', content: buildDiscussionContext(state, player) },
    ];

    const response = await callLLM(messages, 0.9);
    // 清理回复（去掉引号、多余空格等）
    return cleanDiscussionResponse(response);
  } catch {
    return fallbackDiscussion(player, state);
  }
}

/**
 * AI 平票补发言
 */
export async function aiGenerateTieSpeech(
  state: GameState,
  player: Player
): Promise<string | null> {
  if (!isAIConfigured()) {
    return fallbackDiscussion(player, state);
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildRoleSystemPrompt(player.role, player.name, state) },
      { role: 'user', content: buildTieSpeechContext(state, player) },
    ];

    const response = await callLLM(messages, 0.9);
    return cleanDiscussionResponse(response);
  } catch {
    return fallbackDiscussion(player, state);
  }
}

/**
 * AI 平票补投票选择
 */
export async function aiTieVote(
  state: GameState,
  player: Player
): Promise<{ targetId: string | null; reason: string }> {
  const noReasonResult = (targetId: string | null) => ({ targetId, reason: '' });

  if (!isAIConfigured()) {
    // 后备策略：从平票玩家中随机选
    const candidates = state.players.filter(p => p.isAlive && state.tiePlayerIds.includes(p.id) && p.id !== player.id);
    if (candidates.length === 0) return noReasonResult(null);
    return noReasonResult(candidates[Math.floor(Math.random() * candidates.length)].id);
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildRoleSystemPrompt(player.role, player.name, state) },
      { role: 'user', content: buildTieVoteContext(state, player) },
    ];

    const response = await callLLM(messages);

    // 解析格式：玩家名字|投票理由
    let name: string;
    let reason = '';
    if (response.includes('|')) {
      const parts = response.split('|');
      name = parts[0].trim();
      reason = parts.slice(1).join('|').trim();
    } else {
      name = response.trim();
    }

    name = extractPlayerName(name, state);

    const targetId = findPlayerIdByName(name, state);
    if (targetId && targetId !== player.id && state.tiePlayerIds.includes(targetId)) {
      return { targetId, reason };
    }

    // 如果找不到有效目标或不在平票玩家中，随机投一个平票玩家
    const candidates = state.players.filter(p => p.isAlive && state.tiePlayerIds.includes(p.id) && p.id !== player.id);
    return noReasonResult(candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)].id
      : null);
  } catch {
    const candidates = state.players.filter(p => p.isAlive && state.tiePlayerIds.includes(p.id) && p.id !== player.id);
    return noReasonResult(candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)].id
      : null);
  }
}

/**
 * AI 投票选择
 */
export async function aiVote(
  state: GameState,
  player: Player
): Promise<{ targetId: string | null; reason: string }> {
  const noReasonResult = (targetId: string | null) => ({ targetId, reason: '' });

  if (!isAIConfigured()) {
    // 后备策略
    const candidates = state.players.filter(p => p.isAlive && p.id !== player.id);
    if (candidates.length === 0) return noReasonResult(null);
    return noReasonResult(candidates[Math.floor(Math.random() * candidates.length)].id);
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildRoleSystemPrompt(player.role, player.name, state) },
      { role: 'user', content: buildVoteContext(state, player) },
    ];

    const response = await callLLM(messages);

    // 解析格式：玩家名字|投票理由
    let name: string;
    let reason = '';
    if (response.includes('|')) {
      const parts = response.split('|');
      name = parts[0].trim();
      reason = parts.slice(1).join('|').trim();
    } else {
      name = response.trim();
    }

    // 用 extractPlayerName 从解析出的名字中提取
    name = extractPlayerName(name, state);

    if (name === '弃票' || name === 'skip') return { targetId: 'skip', reason };

    const targetId = findPlayerIdByName(name, state);
    if (targetId && targetId !== player.id) return { targetId, reason };

    // 如果找不到有效目标，随机投
    const candidates = state.players.filter(p => p.isAlive && p.id !== player.id);
    return noReasonResult(candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)].id
      : null);
  } catch {
    const candidates = state.players.filter(p => p.isAlive && p.id !== player.id);
    return noReasonResult(candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)].id
      : null);
  }
}

// ============ 辅助函数 ============

// 从 AI 回复中提取玩家名字（AI可能返回带或不带 (你) 的名字）
export function extractPlayerName(response: string, state: GameState): string {
  const allNames = state.players.map(p => p.name);
  const cleanNames = state.players.map(p => getAIName(p));
  // 合并两个列表（按长度降序排列），同时支持带 (你) 和不带的匹配
  const allVariants = [...new Set([...allNames, ...cleanNames])];
  const sortedNames = [...allVariants].sort((a, b) => b.length - a.length);

  // 先尝试精确匹配（长名字优先）
  for (const name of sortedNames) {
    if (response.includes(name)) {
      return name;
    }
  }

  // 检查是否是弃票
  if (response.includes('弃票')) return '弃票';

  // 返回清理后的第一行
  const firstLine = response.split('\n')[0].trim();
  // 去掉常见的标点和多余字符
  const cleaned = firstLine.replace(/^["'「『]|["'」』]$/g, '').replace(/[。，！？、]/g, '').trim();

  // 再次尝试匹配
  for (const name of sortedNames) {
    if (cleaned.includes(name)) {
      return name;
    }
  }

  return cleaned;
}

// 根据名字找玩家 ID（支持带或不带 (你) 后缀的匹配）
export function findPlayerIdByName(name: string, state: GameState): string | null {
  // 精确匹配优先（原始名）
  const exact = state.players.find(p => p.name === name);
  if (exact) return exact.id;
  // 精确匹配（清理后的名）
  const exactClean = state.players.find(p => getAIName(p) === name);
  if (exactClean) return exactClean.id;
  // 模糊匹配（按长度降序，避免短名匹配长名）
  const sorted = [...state.players].sort((a, b) => b.name.length - a.name.length);
  const fuzzy = sorted.find(p => p.name.includes(name) || name.includes(p.name) || getAIName(p).includes(name));
  return fuzzy?.id || null;
}

// 清理讨论回复
function cleanDiscussionResponse(response: string): string {
  // 去掉首尾引号
  let cleaned = response.trim();
  cleaned = cleaned.replace(/^["'「『]|["'」』]$/g, '');
  return cleaned;
}

// ============ 后备方案：没有配置 API 时使用模板发言 ============

function fallbackDiscussion(player: Player, state: GameState): string {
  const speeches: Record<Role, string[]> = {
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
      '从目前的局势来看，我们需要更加谨慎。',
    ],
    witch: [
      '局势还在可控范围内，大家不要慌乱。',
      '我建议大家多关注发言细节，有些人明显在掩饰什么。',
      '每个人都有自己的判断，重要的是团结一致。',
    ],
    guard: [
      '我会尽我所能保护大家，请放心。',
      '我建议大家把注意力放在行为异常的人身上。',
    ],
    hunter: [
      '我这个人说话比较直，但都是为了大家好。',
      '不要觉得可以随便欺负人，有些人可不是好惹的。',
      '我建议大家大胆表达，隐藏只会让狼人得利。',
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

// ============ 猎人开枪决策 ============

/**
 * 为猎人 AI 构建开枪选择目标的上下文
 */
function buildHunterShootContext(state: GameState, hunter: Player): string {
  const aliveOthers = state.players.filter(p => p.isAlive && p.id !== hunter.id);

  return `## 当前游戏状态

### 第 ${state.round + 1} 轮 - 猎人临死开枪

### 你的身份：🏹 猎人
你即将出局，现在可以开枪带走一名存活玩家。
- 如果你被**白天投票放逐**：全场会公开宣布你是猎人，以及你带走了谁。
- 如果你**夜晚被狼人杀害**：开枪是无声的，全场只会看到多死了一个人，不知道是你猎人开的枪。

### 你的历史操作：
${buildPlayerActionHistory(state, hunter)}

### 可带走的目标（所有存活的其他玩家）：
${aliveOthers.length > 0
  ? aliveOthers.map(p => `- ${getAIName(p)}`).join('\n')
  : '（没有可带走的目标）'}

### 已淘汰玩家：
${state.players.filter(p => !p.isAlive).length > 0
  ? state.players.filter(p => !p.isAlive).map(p => `- ${getAIName(p)}`).join('\n')
  : '（暂无）'}

### 📜 历史轮次回顾（含讨论与投票结果）：
${getRoundHistory(state, hunter.id)}

---
请选择你要开枪带走的目标。你只能带走一名存活玩家（不能带走自己）。
请只回复玩家的名字，不要包含其他内容。例如：张三`;
}

/**
 * AI 猎人开枪选择目标
 */
export async function aiHunterChooseTarget(state: GameState, hunterId: string): Promise<string | null> {
  const hunter = state.players.find(p => p.id === hunterId);
  if (!hunter || hunter.role !== 'hunter') return null;

  const aliveOthers = state.players.filter(p => p.isAlive && p.id !== hunterId);
  if (aliveOthers.length === 0) return null;

  // 人类玩家猎人 → 随机（后续可加 UI）
  if (!hunter.isAI) {
    return aliveOthers[Math.floor(Math.random() * aliveOthers.length)].id;
  }

  // 没有 API → 随机后备
  if (!isAIConfigured()) {
    return aliveOthers[Math.floor(Math.random() * aliveOthers.length)].id;
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildRoleSystemPrompt('hunter', hunter.name, state) },
      { role: 'user', content: buildHunterShootContext(state, hunter) },
    ];

    const response = await callLLM(messages);
    const name = extractPlayerName(response, state);
    const targetId = findPlayerIdByName(name, state);

    return targetId || aliveOthers[Math.floor(Math.random() * aliveOthers.length)].id;
  } catch {
    return aliveOthers[Math.floor(Math.random() * aliveOthers.length)].id;
  }
}

// ============ MVP 评选 ============

/**
 * 游戏结束后，调用大模型评选本局 MVP
 */
export async function aiSelectMVP(state: GameState): Promise<{ playerId: string; reason: string } | null> {
  if (!isAIConfigured()) return null;

  const allPlayers = state.players;

  // 构建上帝视角的完整信息
  let context = `## 本局游戏结束 - MVP 评选

### 游戏结果：
${state.gameResult === 'werewolf-win' ? '狼人阵营获胜！' : '村民阵营获胜！'}

### 所有玩家身份（上帝视角）：
${allPlayers.map(p => `- ${p.name.replace(/\(你\)$/, '')}：${ROLE_NAMES[p.role]}（${p.isAlive ? '存活' : '已淘汰'}）`).join('\n')}

### 夜晚行动记录：
${state.nightActions.length > 0
  ? state.nightActions.map(a => `- 第${a.round + 1}轮：${a.action}`).join('\n')
  : '（无记录）'}

### 所有讨论发言记录：
${state.discussionMessages.map(m => `- [第${m.round + 1}轮] ${m.playerName.replace(/\(你\)$/, '')}：${m.content}`).join('\n')}

### 投票记录：
${Array.from(new Set(state.discussionMessages.map(m => m.round))).map(round => {
  const voteDetails: string[] = [];
  for (const [voterId, targetId] of Object.entries(state.previousDayVotes || {})) {
    const voter = allPlayers.find(p => p.id === voterId);
    const target = allPlayers.find(p => p.id === targetId) || { name: '弃票' };
    if (voter) voteDetails.push(`${voter.name.replace(/\(你\)$/, '')}→${typeof target === 'string' ? target : target.name.replace(/\(你\)$/, '')}`);
  }
  return voteDetails.length > 0 ? `- 第${round + 1}轮投票：${voteDetails.join('，')}` : '';
}).filter(Boolean).join('\n') || '（无记录）'}

### 游戏日志：
${state.logs.map(l => `- [第${l.round + 1}轮] ${l.message}`).join('\n')}

---
请你根据以上完整的上帝视角信息，评选出本局游戏的 MVP（最有价值玩家）。

评选标准：
- 为所在阵营的胜利做出了最关键贡献
- 发言、投票、技能使用等方面的综合表现
- 如果是狼人阵营获胜：哪位狼人表现最出色（潜伏深、带节奏、假跳身份骗到好人等）
- 如果是村民阵营获胜：哪位好人表现最出色（推理准、查验到狼人、用药关键、带队投票等）

请只回复JSON格式（不要包含其他内容）：
{"playerName": "玩家名", "reason": "获奖理由（50-100字，具体说明该玩家做了什么关键操作）"}`;

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一个狼人杀游戏的MVP评委。请根据完整的上帝视角信息公正评选。只回复JSON。' },
      { role: 'user', content: context },
    ];

    const response = await callLLM(messages);
    
    // 解析 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const playerName = result.playerName;
      const player = allPlayers.find(p => p.name.replace(/\(你\)$/, '') === playerName || p.name === playerName);
      if (player) {
        return { playerId: player.id, reason: result.reason };
      }
    }
    return null;
  } catch {
    return null;
  }
}

