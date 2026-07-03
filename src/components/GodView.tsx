import React, { useState } from 'react';
import { Eye, EyeOff, Moon, Sun, MessageSquare, Vote, X, ChevronDown, ChevronRight } from 'lucide-react';
import { GameState, Role } from '../types/game';

interface GodViewProps {
  gameState: GameState;
}

const ROLE_NAMES: Record<Role, string> = {
  werewolf: '🐺 狼人',
  villager: '👤 村民',
  seer: '🔮 预言家',
  witch: '🧪 女巫',
  hunter: '🏹 猎人',
  guard: '🛡️ 守卫',
};

const ROLE_COLORS: Record<Role, string> = {
  werewolf: 'text-red-400',
  villager: 'text-green-400',
  seer: 'text-purple-400',
  witch: 'text-cyan-400',
  hunter: 'text-orange-400',
  guard: 'text-blue-400',
};

const GodView: React.FC<GodViewProps> = ({ gameState }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'roles' | 'night' | 'speech' | 'votes'>('speech');
  const [showRoleColors, setShowRoleColors] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-0 top-1/3 z-30 bg-primary-900/90 border border-primary-700/50 border-r-0 rounded-l-xl px-2 py-4 text-primary-400 hover:text-accent-400 hover:bg-primary-800/90 transition-all cursor-pointer"
        title="上帝视角"
      >
        <Eye className="w-5 h-5" />
      </button>
    );
  }

  const alivePlayers = gameState.players.filter(p => p.isAlive);
  const deadPlayers = gameState.players.filter(p => !p.isAlive);

  // Get night actions grouped by round
  const nightActionsByRound = new Map<number, typeof gameState.nightActions>();
  for (const na of gameState.nightActions) {
    if (!nightActionsByRound.has(na.round)) {
      nightActionsByRound.set(na.round, []);
    }
    nightActionsByRound.get(na.round)!.push(na);
  }

  // Get speech records by round, then by player (in speech order)
  const speechByRound = new Map<number, Array<{ playerId: string; playerName: string; role: Role; content: string }>>();
  for (const msg of gameState.discussionMessages) {
    if (!speechByRound.has(msg.round)) {
      speechByRound.set(msg.round, []);
    }
    const player = gameState.players.find(p => p.id === msg.playerId);
    speechByRound.get(msg.round)!.push({
      playerId: msg.playerId,
      playerName: player?.name || msg.playerName,
      role: player?.role || 'villager',
      content: msg.content,
    });
  }

  // Get last words logs grouped by round
  const lastWordsByRound = new Map<number, string[]>();
  for (const log of gameState.logs) {
    if (log.phase === 'day-last-words') {
      if (!lastWordsByRound.has(log.round)) {
        lastWordsByRound.set(log.round, []);
      }
      // Extract clean text from log message format: "💬 XXX的遗言：「...」"
      const cleanText = log.message.replace(/^💬 .+?的遗言：「/, '').replace(/」$/, '');
      lastWordsByRound.get(log.round)!.push(cleanText);
    }
  }

  // Collect all rounds that have either speeches or last words
  const allSpeechRounds = new Set<number>();
  speechByRound.forEach((_, r) => allSpeechRounds.add(r));
  lastWordsByRound.forEach((_, r) => allSpeechRounds.add(r));

  // Get vote records by round
  const voteRecordsByRound = new Map<number, Array<{ voter: string; target: string }>>();
  // From logs
  for (const log of gameState.logs) {
    if (log.phase === 'day-result' && log.message.includes('投票详情')) {
      const match = log.message.match(/📊 投票详情：(.*)/);
      if (match) {
        const details = match[1].split('，');
        for (const d of details) {
          const parts = d.split('→');
          if (parts.length === 2) {
            if (!voteRecordsByRound.has(log.round)) {
              voteRecordsByRound.set(log.round, []);
            }
            voteRecordsByRound.get(log.round)!.push({ voter: parts[0], target: parts[1] });
          }
        }
      }
    }
  }
  // From previousDayVotes
  if (Object.keys(gameState.previousDayVotes).length > 0) {
    const r = gameState.round;
    if (!voteRecordsByRound.has(r)) voteRecordsByRound.set(r, []);
    for (const [vid, tid] of Object.entries(gameState.previousDayVotes)) {
      const voter = gameState.players.find(p => p.id === vid)?.name?.replace(/\(你\)$/, '') || '?';
      const target = tid === 'skip' ? '弃票' : (gameState.players.find(p => p.id === tid)?.name?.replace(/\(你\)$/, '') || '?');
      const exists = voteRecordsByRound.get(r)!.some(v => v.voter === voter);
      if (!exists) {
        voteRecordsByRound.get(r)!.push({ voter, target });
      }
    }
  }

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-primary-950/95 border-l border-primary-700/50 z-30 overflow-y-auto shadow-2xl">
      {/* Header */}
      <div className="sticky top-0 bg-primary-950/95 border-b border-primary-700/50 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-accent-400" />
          <h2 className="text-lg font-bold text-primary-100">上帝视角</h2>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-primary-500 hover:text-primary-300 cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-primary-700/50 bg-primary-900/50 sticky top-[73px] z-10">
        {([
          ['speech', '发言'],
          ['roles', '身份'],
          ['night', '夜晚'],
          ['votes', '投票'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2.5 text-xs font-medium cursor-pointer transition-all ${
              activeTab === key
                ? 'text-accent-400 border-b-2 border-accent-400'
                : 'text-primary-500 hover:text-primary-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3">
        {/* Role Tab */}
        {activeTab === 'roles' && (
          <div className="space-y-3">
            {/* Alive */}
            <div>
              <h3 className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
                <Sun className="w-3 h-3" /> 存活 ({alivePlayers.length})
              </h3>
              <div className="space-y-1.5">
                {alivePlayers.map(p => (
                  <div key={p.id} className="bg-primary-900/60 border border-primary-800/40 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className={`text-sm font-medium ${ROLE_COLORS[p.role]}`}>
                      {p.name}
                    </span>
                    <span className={`text-xs ${ROLE_COLORS[p.role]}`}>{ROLE_NAMES[p.role]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dead */}
            {deadPlayers.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-red-400 mb-2 flex items-center gap-1">
                  <Moon className="w-3 h-3" /> 已死亡 ({deadPlayers.length})
                </h3>
                <div className="space-y-1.5">
                  {deadPlayers.map(p => (
                    <div key={p.id} className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 flex items-center justify-between opacity-70">
                      <span className="text-sm text-primary-500 line-through">
                        {p.name.replace(/\(你\)$/, '')}
                      </span>
                      <span className={`text-xs ${ROLE_COLORS[p.role]}`}>{ROLE_NAMES[p.role]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Witch items */}
            <div className="bg-primary-900/60 border border-primary-800/40 rounded-lg p-3">
              <h3 className="text-xs font-bold text-cyan-400 mb-2">🧪 女巫药品</h3>
              {gameState.players.filter(p => p.role === 'witch').map(w => (
                <div key={w.id} className="text-xs text-primary-400 space-y-0.5">
                  <p>{w.name.replace(/\(你\)$/, '')}：解药 {w.hasAntidote ? '✅' : '❌'} | 毒药 {w.hasPoison ? '✅' : '❌'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Night Tab */}
        {activeTab === 'night' && (
          <div className="space-y-3">
            {Array.from(nightActionsByRound.entries()).sort(([a], [b]) => a - b).map(([round, actions]) => (
              <div key={round} className="bg-primary-900/60 border border-primary-800/40 rounded-lg p-3">
                <h3 className="text-xs font-bold text-primary-300 mb-2">第 {round + 1} 晚</h3>
                <div className="space-y-1.5">
                  {actions.map((a, i) => (
                    <div key={i} className="text-xs bg-primary-800/30 rounded px-2 py-1.5">
                      <span className={ROLE_COLORS[a.actorRole]}>
                        {a.actorName.replace(/\(你\)$/, '')}
                      </span>
                      <span className="text-primary-500 mx-1">-</span>
                      <span className="text-primary-400">{a.action}</span>
                      {a.targetName && (
                        <span className="text-primary-300 ml-1">→ {a.targetName.replace(/\(你\)$/, '')}</span>
                      )}
                    </div>
                  ))}
                  {actions.length === 0 && (
                    <p className="text-xs text-primary-600">无记录</p>
                  )}
                </div>
              </div>
            ))}
            {nightActionsByRound.size === 0 && (
              <p className="text-xs text-primary-500 text-center py-4">暂无夜晚行动记录</p>
            )}
          </div>
        )}

        {/* Speech Tab */}
        {activeTab === 'speech' && (
          <div className="space-y-3">
            {/* Toggle role colors button */}
            <button
              onClick={() => setShowRoleColors(!showRoleColors)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                showRoleColors
                  ? 'bg-accent-400/15 text-accent-400 border border-accent-400/30'
                  : 'bg-primary-800/40 text-primary-400 border border-primary-700/40 hover:text-primary-300'
              }`}
            >
              {showRoleColors ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showRoleColors ? '隐藏身份颜色' : '显示身份颜色'}
            </button>
            {Array.from(allSpeechRounds)
              .sort((a, b) => a - b)
              .map((round) => {
                const speeches = speechByRound.get(round) || [];
                const lastWords = lastWordsByRound.get(round) || [];
                return (
              <div key={round} className="bg-primary-900/60 border border-primary-800/40 rounded-lg p-3">
                <h3 className="text-xs font-bold text-primary-300 mb-2 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> 第 {round + 1} 天
                </h3>
                <div className="space-y-1.5">
                  {speeches.map((s, i) => {
                    return (
                      <div
                        key={i}
                        className="text-xs bg-primary-800/30 rounded px-2 py-1.5"
                      >
                        <span className={`font-medium ${showRoleColors ? ROLE_COLORS[s.role] : 'text-primary-200'}`}>
                          {s.playerName.replace(/\(你\)$/, '')}
                        </span>
                        <span className="text-primary-500 mx-1">：</span>
                        <span className="text-primary-300 whitespace-pre-wrap">{s.content}</span>
                      </div>
                    );
                  })}
                  {/* 遗言信息 */}
                  {lastWords.map((lw, i) => (
                    <div
                      key={`lw-${i}`}
                      className="text-xs bg-primary-800/30 rounded px-2 py-1.5 border border-primary-700/40"
                    >
                      <span className="text-accent-400 font-medium">💬 遗言：</span>
                      <span className="text-primary-300 italic whitespace-pre-wrap">{lw}</span>
                    </div>
                  ))}
                </div>
              </div>
                );
              })}
            {speechByRound.size === 0 && (
              <p className="text-xs text-primary-500 text-center py-4">暂无发言记录</p>
            )}
          </div>
        )}

        {/* Votes Tab */}
        {activeTab === 'votes' && (
          <div className="space-y-3">
            {Array.from(voteRecordsByRound.entries()).sort(([a], [b]) => a - b).map(([round, votes]) => (
              <div key={round} className="bg-primary-900/60 border border-primary-800/40 rounded-lg p-3">
                <h3 className="text-xs font-bold text-primary-300 mb-2 flex items-center gap-1">
                  <Vote className="w-3 h-3" /> 第 {round + 1} 天投票
                </h3>
                <div className="space-y-1">
                  {votes.map((v, i) => (
                    <div key={i} className="text-xs flex items-center justify-between bg-primary-800/30 rounded px-2 py-1">
                      <span className="text-primary-400">{v.voter}</span>
                      <span className="text-primary-600 mx-2">→</span>
                      <span className={v.target === '弃票' ? 'text-primary-500' : 'text-accent-400'}>
                        {v.target}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {voteRecordsByRound.size === 0 && (
              <p className="text-xs text-primary-500 text-center py-4">暂无投票记录</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GodView;
