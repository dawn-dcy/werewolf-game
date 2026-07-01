import React from 'react';
import { Moon, Sun, Skull, Eye, FlaskConical, Shield, MessageSquare, Vote, Gavel, Sparkles } from 'lucide-react';
import { GameState } from '../types/game';
import PlayerList from './PlayerList';
import GameLog from './GameLog';

interface SpectatorViewProps {
  gameState: GameState;
  onAdvance: () => void;
}

const SpectatorView: React.FC<SpectatorViewProps> = ({ gameState, onAdvance }) => {
  const phase = gameState.phase;
  const alivePlayers = gameState.players.filter(p => p.isAlive);
  const deadPlayers = gameState.players.filter(p => !p.isAlive);

  // Night phase names
  const nightPhaseNames: Record<string, { icon: React.ReactNode; title: string; desc: string }> = {
    'night-summary': { icon: <Moon className="w-6 h-6 text-accent-400" />, title: '生成摘要中', desc: '正在生成上一轮的摘要总结...' },
    'night-werewolf': { icon: <Skull className="w-6 h-6 text-blood-400" />, title: '狼人行动中', desc: '狼人正在选择今晚的击杀目标...' },
    'night-seer': { icon: <Eye className="w-6 h-6 text-purple-400" />, title: '预言家查验中', desc: '预言家正在查验一名玩家的身份...' },
    'night-witch': { icon: <FlaskConical className="w-6 h-6 text-cyan-400" />, title: '女巫决策中', desc: '女巫正在决定是否使用药水...' },
    'night-guard': { icon: <Shield className="w-6 h-6 text-green-400" />, title: '守卫守护中', desc: '守卫正在选择要守护的玩家...' },
    'night-result': { icon: <Moon className="w-6 h-6 text-accent-400" />, title: '夜晚结算', desc: '正在结算夜晚的结果...' },
  };

  return (
    <div className="min-h-screen moon-bg p-4 pb-32">
      <div className="max-w-3xl mx-auto">

        {/* Spectator Banner */}
        <div className="bg-primary-900/60 border border-blood-500/30 rounded-2xl p-4 mb-4 flex items-center gap-4">
          <div className="text-3xl flex-shrink-0">💀</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-primary-200">旁观模式</h2>
            <p className="text-primary-500 text-sm">你已被淘汰，可以观看其他玩家继续游戏</p>
          </div>
          <div className="text-xs text-primary-600 bg-primary-800/50 px-3 py-1 rounded-full">
            第 {gameState.round + 1} 轮
          </div>
        </div>

        {/* Current Phase Indicator */}
        <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center">
              {phase.startsWith('night-') ? (
                <Moon className="w-5 h-5 text-accent-400" />
              ) : (
                <Sun className="w-5 h-5 text-accent-400" />
              )}
            </div>
            <div>
              <p className="text-accent-400 font-bold text-lg">
                {phase.startsWith('night-') ? '🌙 夜晚阶段' : '☀️ 白天阶段'}
              </p>
              <p className="text-primary-500 text-xs">
                {getPhaseDescription(phase)}
              </p>
            </div>
          </div>

          {/* Night phase details */}
          {phase.startsWith('night-') && nightPhaseNames[phase] && (
            <div className="bg-primary-800/30 border border-primary-700/30 rounded-xl p-3 mb-2">
              <div className="flex items-center gap-2 mb-1">
                {nightPhaseNames[phase].icon}
                <span className="text-primary-300 font-medium text-sm">{nightPhaseNames[phase].title}</span>
              </div>
              <p className="text-primary-500 text-xs ml-8">{nightPhaseNames[phase].desc}</p>
            </div>
          )}

          {/* Night result summary */}
          {phase === 'night-result' && (
            <div className="space-y-2">
              {gameState.logs
                .filter(l => l.phase === 'night-result' && l.round === gameState.round)
                .slice(-3)
                .map(log => (
                  <div key={log.id} className="bg-primary-800/30 border border-primary-700/30 rounded-xl p-3">
                    <p className="text-primary-300 text-sm">{log.message}</p>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Day Discussion Phase - Show discussions */}
        {phase === 'day-discussion' && (
          <>
            {/* Night result recap */}
            <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-4">
              <h3 className="text-sm font-bold text-primary-300 mb-3 flex items-center gap-2">
                <Moon className="w-4 h-4 text-accent-400" />
                昨夜情况
              </h3>
              {(() => {
                const nightDeathNames: string[] = [];
                for (const log of gameState.logs) {
                  if (log.round === gameState.round && log.phase === 'night-result') {
                    const match = log.message.match(/昨晚，(.+?) 死了/);
                    if (match) nightDeathNames.push(match[1]);
                  }
                }
                const uniqueNames = [...new Set(nightDeathNames)];
                if (uniqueNames.length > 0) {
                  return (
                    <div className="flex items-center gap-3 p-3 bg-blood-500/5 border border-blood-500/20 rounded-xl">
                      <span className="text-2xl">💀</span>
                      <div>
                        <p className="text-blood-400 font-medium">
                          {uniqueNames.join(' 和 ')} 死了
                        </p>
                        <p className="text-primary-500 text-xs mt-0.5">昨晚有人死亡</p>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="flex items-center gap-3 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                      <span className="text-2xl">🌙</span>
                      <div>
                        <p className="text-green-400 font-medium">昨晚是平安夜</p>
                        <p className="text-primary-500 text-xs mt-0.5">无人死亡</p>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>

            {/* Discussion logs */}
            <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-4">
              <h3 className="text-sm font-bold text-primary-300 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-accent-400" />
                讨论记录
                <span className="text-primary-600 text-xs font-normal">
                  ({(gameState.discussionMessages || []).filter(m => m.round === gameState.round).length} 条发言)
                </span>
              </h3>
              <div className="space-y-2 text-sm max-h-60 overflow-y-auto">
                {(gameState.discussionMessages || []).filter(m => m.round === gameState.round).map((msg) => {
                  const player = gameState.players.find(p => p.id === msg.playerId);
                  const isWerewolf = player?.role === 'werewolf';
                  return (
                    <div key={msg.id} className="flex gap-2 items-start p-2 rounded-lg hover:bg-primary-800/30 transition-colors">
                      <span className={`text-xs w-16 flex-shrink-0 font-medium ${
                        isWerewolf ? 'text-blood-400/80' : 'text-primary-400'
                      }`}>
                        {msg.playerName}：
                      </span>
                      <span className={`${isWerewolf ? 'text-blood-400/70' : 'text-primary-300'}`}>
                        {msg.content}
                      </span>
                    </div>
                  );
                })}
                {(!gameState.discussionMessages || gameState.discussionMessages.filter(m => m.round === gameState.round).length === 0) && (
                  <p className="text-primary-500 text-sm text-center py-4">等待玩家发言...</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Vote Phase */}
        {phase === 'day-vote' && (
          <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-bold text-primary-300 mb-3 flex items-center gap-2">
              <Vote className="w-4 h-4 text-accent-400" />
              投票放逐
            </h3>

            {/* Vote progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-primary-500">
                {Object.keys(gameState.dayVotes).length} / {alivePlayers.length} 人已投票
              </span>
              <span className="text-xs text-primary-500">
                {alivePlayers.filter(p => !gameState.dayVotes[p.id]).map(p => p.name).join('、') || '全部已投票'}
                {alivePlayers.some(p => !gameState.dayVotes[p.id]) && ' 未投票'}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2.5 bg-primary-800 rounded-full mb-4">
              <div
                className="h-full bg-accent-500 rounded-full transition-all duration-500"
                style={{
                  width: `${(Object.keys(gameState.dayVotes).length / Math.max(1, alivePlayers.length)) * 100}%`
                }}
              />
            </div>

            {/* Vote counts */}
            <div className="space-y-2">
              {getVoteCounts(gameState).map(({ name, count, id }) => (
                <div key={id} className="flex items-center justify-between text-sm p-2 bg-primary-800/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-primary-300">{name}</span>
                    {gameState.players.find(p => p.id === id && !p.isAlive) && (
                      <span className="text-xs text-primary-600">(已淘汰)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-36 h-2 bg-primary-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blood-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${(count / Math.max(1, alivePlayers.length)) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-blood-400 font-bold w-4 text-right">{count}</span>
                    <span className="text-primary-600 text-xs">票</span>
                  </div>
                </div>
              ))}
              {getVoteCounts(gameState).length === 0 && (
                <p className="text-primary-500 text-sm text-center py-4">暂无投票</p>
              )}
            </div>
          </div>
        )}

        {/* Day Result Phase */}
        {phase === 'day-result' && (
          <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-bold text-primary-300 mb-3 flex items-center gap-2">
              <Gavel className="w-4 h-4 text-accent-400" />
              投票结果
            </h3>

            {/* Vote details: who voted for whom */}
            {Object.keys(gameState.previousDayVotes || {}).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-primary-400 mb-2">📊 投票详情：</p>
                <div className="space-y-1.5">
                  {Object.entries(gameState.previousDayVotes || {}).map(([voterId, targetId]) => {
                    const voter = gameState.players.find(p => p.id === voterId);
                    const target = gameState.players.find(p => p.id === targetId);
                    return (
                      <div key={voterId}>
                        <div className="flex items-center justify-between text-xs bg-primary-800/30 rounded-lg px-3 py-1.5">
                          <span className="text-primary-300 font-medium">{voter?.name || '未知'}</span>
                          <span className="text-primary-600 mx-2">→</span>
                          <span className={targetId === 'skip' ? 'text-primary-500' : 'text-accent-400 font-medium'}>
                            {targetId === 'skip' ? '弃票' : (target?.name || '未知')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {gameState.logs
                .filter(l => l.phase === 'day-result' && l.round === gameState.round)
                .slice(-3)
                .map(log => (
                  <div key={log.id} className="bg-primary-800/30 border border-primary-700/30 rounded-xl p-3">
                    <p className="text-primary-300 text-sm">{log.message}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Player Status Board */}
        <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-4">
          <h3 className="text-sm font-bold text-primary-300 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-400" />
            玩家状态
          </h3>

          {/* Alive players */}
          <div className="mb-3">
            <p className="text-xs text-green-400/80 mb-2 font-medium">
              🟢 存活玩家 ({alivePlayers.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {alivePlayers.map(p => (
                <div
                  key={p.id}
                  className={`p-2 rounded-lg text-center text-xs ${
                    p.isAI ? 'bg-primary-800/40' : 'bg-accent-500/10 border border-accent-500/30'
                  }`}
                >
                  <p className={`font-medium truncate ${p.isAI ? 'text-primary-300' : 'text-accent-400'}`}>
                    {p.name}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Dead players */}
          {deadPlayers.length > 0 && (
            <div>
              <p className="text-xs text-blood-400/80 mb-2 font-medium">
                💀 已淘汰玩家 ({deadPlayers.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {deadPlayers.map(p => (
                  <div
                    key={p.id}
                    className={`p-2 rounded-lg text-center text-xs ${
                      p.isAI ? 'bg-blood-500/10 border border-blood-500/20' : 'bg-blood-500/20 border border-blood-500/40'
                    }`}
                  >
                    <p className={`font-medium truncate ${p.isAI ? 'text-blood-400/70' : 'text-blood-300'}`}>
                      {p.name}
                    </p>
                    <p className="text-primary-600 text-[10px]">
                      {getRoleName(p.role)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Game Log */}
        <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-4">
          <h3 className="text-sm font-bold text-primary-300 mb-3">📜 游戏日志</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto text-sm">
            {[...gameState.logs].reverse().slice(0, 20).map(log => (
              <div key={log.id} className="flex gap-2 p-2 rounded-lg bg-primary-800/20">
                <span className="text-primary-600 text-xs flex-shrink-0">
                  {log.phase === 'night-result' ? '🌙' :
                   log.phase === 'day-result' ? '☀️' :
                   log.phase === 'role-reveal' ? '🎭' : '📋'}
                </span>
                <p className="text-primary-400 text-xs">{log.message}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Advance buttons for spectator */}
        {(phase === 'day-result' || phase === 'night-result') && (
          <div className="text-center mb-4">
            <button
              onClick={onAdvance}
              className="px-8 py-3 text-primary-950 font-bold rounded-xl cursor-pointer transition-all glow-border bg-accent-600 hover:bg-accent-500"
            >
              {phase === 'day-result' ? '🌙 夜幕降临' : '☀️ 进入白天'}
            </button>
          </div>
        )}

        {/* Manual advance buttons for day phases when human is dead */}
        {phase === 'day-discussion' && (
          <div className="text-center mb-4">
            <p className="text-primary-400 text-xs mb-2">💬 等待 AI 发言中...</p>
            <button
              onClick={onAdvance}
              className="px-6 py-2 bg-primary-700 hover:bg-primary-600 text-primary-200 text-sm font-medium rounded-lg cursor-pointer transition-all"
            >
              🗳️ 跳过讨论，进入投票
            </button>
          </div>
        )}

        {phase === 'day-vote' && (
          <div className="text-center mb-4">
            <p className="text-primary-400 text-xs mb-2">🗳️ 等待 AI 投票中...</p>
            <button
              onClick={onAdvance}
              className="px-6 py-2 bg-primary-700 hover:bg-primary-600 text-primary-200 text-sm font-medium rounded-lg cursor-pointer transition-all"
            >
              📋 立即开票
            </button>
          </div>
        )}

        {/* Waiting indicator for night phases */}
        {(phase !== 'day-result' && phase !== 'night-result' && phase !== 'day-discussion' && phase !== 'day-vote') && (
          <div className="text-center py-4">
            <div className="flex gap-1 justify-center mb-2">
              <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
              <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
            </div>
            <p className="text-primary-500 text-xs">等待玩家行动中...</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper: count votes
function getVoteCounts(gameState: GameState): { name: string; count: number; id: string }[] {
  const counts: Record<string, number> = {};
  Object.values(gameState.dayVotes).forEach(targetId => {
    if (targetId !== 'skip') {
      counts[targetId] = (counts[targetId] || 0) + 1;
    }
  });

  return Object.entries(counts)
    .map(([id, count]) => ({
      id,
      count,
      name: gameState.players.find(p => p.id === id)?.name || '未知',
    }))
    .sort((a, b) => b.count - a.count);
}

// Helper: phase description
function getPhaseDescription(phase: string): string {
  const map: Record<string, string> = {
    'night-summary': '正在生成回合摘要',
    'night-werewolf': '狼人正在选择击杀目标',
    'night-seer': '预言家正在查验身份',
    'night-witch': '女巫正在决定用药',
    'night-guard': '守卫正在选择守护对象',
    'night-result': '正在结算夜晚结果',
    'day-discussion': '玩家们正在讨论昨晚的情况',
    'day-vote': '玩家们正在投票放逐嫌疑人',
    'tie-speech': '平票玩家正在补充发言',
    'day-result': '投票结果已出',
  };
  return map[phase] || '游戏进行中...';
}

// Helper: role name
function getRoleName(role: string): string {
  const names: Record<string, string> = {
    werewolf: '狼人',
    villager: '村民',
    seer: '预言家',
    witch: '女巫',
    hunter: '猎人',
    guard: '守卫',
  };
  return names[role] || role;
}

export default SpectatorView;
