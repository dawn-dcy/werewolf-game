import React, { useState, useRef, useEffect } from 'react';
import { Sun, Vote, MessageSquare, Gavel, Send, User, Bot } from 'lucide-react';
import { GameState, Player, DiscussionMessage } from '../types/game';
import PlayerList from './PlayerList';
import { useGameStore } from '../store/gameStore';

interface DayPhaseProps {
  gameState: GameState;
  userPlayer: Player;
  onVote: (targetId: string) => void;
  onAdvance: () => void;
  onSendMessage: (content: string) => void;
}

const DayPhase: React.FC<DayPhaseProps> = ({ gameState, userPlayer, onVote, onAdvance, onSendMessage }) => {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const phase = gameState.phase;
  const userVoted = gameState.dayVotes[userPlayer.id];
  const alivePlayers = gameState.players.filter(p => p.isAlive);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.discussionMessages]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setMessage('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Dead player is handled by SpectatorView in App.tsx
  if (!userPlayer.isAlive) {
    return null;
  }

  if (phase === 'day-discussion') {
    const allMessages = gameState.discussionMessages || [];
    // 只显示当前轮次的发言
    const messages = allMessages.filter(m => m.round === gameState.round);
    const order = gameState.discussionOrder || [];
    const currentIdx = gameState.currentSpeakerIndex ?? -1;
    const allSpoken = currentIdx >= order.length;
    const isMyTurn = !allSpoken && order[currentIdx] === userPlayer.id;
    const currentSpeaker = !allSpoken ? gameState.players.find(p => p.id === order[currentIdx]) : null;
    const spokenPlayers = order.slice(0, currentIdx);
    const remainingPlayers = order.slice(currentIdx);

    return (
      <div className="min-h-screen moon-bg p-4 pb-28">
        <div className="max-w-3xl mx-auto animate-fade-in">
          {/* Header */}
          <div className="text-center mb-4">
            <Sun className="w-10 h-10 text-accent-400 mx-auto mb-2" />
            <p className="text-primary-500 text-xs tracking-widest mb-1">第 {gameState.round + 1} 天</p>
            <div className="flex items-center justify-center gap-2 mb-1">
              <MessageSquare className="w-6 h-6 text-accent-400" />
              <h2 className="text-xl font-black text-primary-100 glow-text">讨论阶段</h2>
            </div>
            <p className="text-primary-400 text-xs">
              {allSpoken
                ? '所有玩家发言完毕，可以进入投票'
                : isMyTurn
                  ? '轮到你了！请输入你的发言'
                  : `当前发言：${currentSpeaker?.name || '...'}`}
            </p>
          </div>

          {/* Speaking order indicator */}
          <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-3">
            <h3 className="text-xs font-bold text-primary-300 mb-3 flex items-center gap-2">
              📋 发言顺序（顺时针）：
              {gameState.lastKilledId && (
                <span className="text-blood-400 text-xs font-normal">
                  从死者{gameState.players.find(p => p.id === gameState.lastKilledId)?.name}下一位开始
                </span>
              )}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {order.map((pid, idx) => {
                const p = gameState.players.find(pl => pl.id === pid);
                if (!p) return null;
                const spoken = idx < currentIdx;
                const speaking = idx === currentIdx;
                return (
                  <span
                    key={pid}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      speaking
                        ? 'bg-accent-500/30 text-accent-300 border border-accent-500/50 animate-pulse'
                        : spoken
                          ? 'bg-primary-800/40 text-primary-500 border border-primary-700/30'
                          : 'bg-primary-800/20 text-primary-400 border border-primary-700/20'
                    }`}
                  >
                    {idx + 1}. {p.name} {spoken ? '✅' : speaking ? '🎤' : ''}
                  </span>
                );
              })}
            </div>
            {allSpoken && (
              <p className="text-green-400 text-xs mt-2 text-center">✅ 全部发言完毕，请点击「进入投票」按钮</p>
            )}
          </div>

          {/* Night result summary */}
          <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-3">
            <h3 className="text-xs font-bold text-primary-300 mb-2">🌙 昨夜情况：</h3>
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
                  <div className="flex items-center gap-2 p-2.5 bg-blood-500/5 border border-blood-500/20 rounded-xl">
                    <span className="text-xl">💀</span>
                    <div>
                      <p className="text-blood-400 font-medium text-sm">
                        {uniqueNames.join(' 和 ')} 死了
                      </p>
                      <p className="text-primary-500 text-xs mt-0.5">昨晚有人死亡</p>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="flex items-center gap-2 p-2.5 bg-green-500/5 border border-green-500/20 rounded-xl">
                    <span className="text-xl">🌙</span>
                    <div>
                      <p className="text-green-400 font-medium text-sm">昨晚是平安夜</p>
                      <p className="text-primary-500 text-xs mt-0.5">无人死亡</p>
                    </div>
                  </div>
                );
              }
            })()}
          </div>

          {/* Discussion chat area */}
          <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-3">
            <h3 className="text-xs font-bold text-primary-300 mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-accent-400" />
              讨论记录
              <span className="text-primary-600 font-normal">({messages.length} 条发言)</span>
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1" style={{ scrollBehavior: 'smooth' }}>
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="w-8 h-8 text-primary-700 mx-auto mb-2" />
                  <p className="text-primary-500 text-sm">等待第一位发言者...</p>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.playerId === userPlayer.id;
                const player = gameState.players.find(p => p.id === msg.playerId);

                return (
                  <div key={msg.id} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      isUser
                        ? 'bg-accent-500/30 text-accent-400 border border-accent-500/50'
                        : 'bg-primary-700/50 text-primary-400 border border-primary-600/30'
                    }`}>
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    {/* Message bubble */}
                    <div className={`max-w-[75%] ${isUser ? 'items-end' : ''}`}>
                      <div className={`flex items-center gap-1 mb-0.5 ${isUser ? 'justify-end' : ''}`}>
                        <span className={`text-xs font-medium ${
                          isUser ? 'text-accent-400' : 'text-primary-400'
                        }`}>
                          {msg.playerName}
                        </span>
                      </div>
                      <div className={`px-3 py-2 rounded-2xl text-sm ${
                        isUser
                          ? 'bg-accent-500/20 border border-accent-500/30 text-accent-100 rounded-tr-md'
                          : 'bg-primary-800/60 border border-primary-700/40 text-primary-300 rounded-tl-md'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Player status overview */}
          <div className="mb-3">
            <h3 className="text-xs font-bold text-primary-300 mb-2">存活玩家（{alivePlayers.length}）：</h3>
            <PlayerList players={gameState.players} compact />
          </div>

          {/* Chat input area + advance button */}
          <div className="fixed bottom-0 left-0 right-0 bg-primary-950/95 border-t border-primary-800/50 p-3 z-20">
            <div className="max-w-3xl mx-auto flex gap-3 items-center">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    allSpoken
                      ? '所有玩家已发言完毕'
                      : isMyTurn
                        ? '轮到你了！请输入发言... (Enter 发送)'
                        : `等待 ${currentSpeaker?.name || '...'} 发言中...`
                  }
                  disabled={!isMyTurn && !allSpoken}
                  className="w-full px-4 py-2.5 bg-primary-800/60 border border-primary-700/50 rounded-xl text-primary-200 text-sm placeholder-primary-600 focus:outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  maxLength={500}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-primary-600">
                  {message.length}/500
                </span>
              </div>

              <button
                onClick={handleSend}
                disabled={!message.trim() || !isMyTurn}
                className="px-4 py-2.5 bg-accent-600 hover:bg-accent-500 disabled:bg-primary-700 disabled:text-primary-500 text-primary-950 font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 flex-shrink-0"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">发言</span>
              </button>

              <button
                onClick={onAdvance}
                disabled={!allSpoken}
                className={`px-4 py-2.5 rounded-xl text-sm cursor-pointer transition-all flex items-center gap-1.5 flex-shrink-0 border ${
                  allSpoken
                    ? 'bg-accent-600 hover:bg-accent-500 text-primary-950 font-bold border-accent-400 glow-border shadow-lg shadow-accent-500/30'
                    : 'bg-primary-700 text-primary-300 border-primary-600/50 opacity-60 cursor-not-allowed'
                }`}
              >
                <Gavel className="w-4 h-4" />
                <span className="hidden sm:inline">进入投票</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ 平票补发言 ============
  if (phase === 'tie-speech') {
    const tieIds = gameState.tiePlayerIds;
    const tieIdx = gameState.tieSpeakerIndex;
    const isMyTurn = tieIdx >= 0 && tieIdx < tieIds.length && tieIds[tieIdx] === userPlayer.id;
    const currentSpeaker = tieIdx >= 0 && tieIdx < tieIds.length
      ? gameState.players.find(p => p.id === tieIds[tieIdx])
      : null;

    const submitTieSpeech = () => {
      if (!message.trim() || !isMyTurn) return;
      const store = useGameStore;
      const s = store.getState().gameState;
      if (!s) return;

      const newMsg = {
        id: `msg-${Date.now()}`,
        playerId: userPlayer.id, playerName: userPlayer.name,
        content: `【平票补发言】${message.trim()}`,
        round: s.round, timestamp: Date.now(),
      };
      store.setState({
        gameState: {
          ...s,
          discussionMessages: [...s.discussionMessages, newMsg],
          tieSpeakerIndex: s.tieSpeakerIndex + 1,
        }
      });
      setMessage('');

      // 推进后续发言者（AI 或其他人类平票玩家）
      setTimeout(() => {
        const s2 = useGameStore.getState().gameState;
        if (s2 && s2.phase === 'tie-speech') {
          if (s2.tieSpeakerIndex >= s2.tiePlayerIds.length) {
            // 所有平票玩家都发言完毕 → 进入投票
            useGameStore.getState().advancePhase();
          } else {
            // 还有下一位平票发言者（AI）→ 触发 AI 补发言流程
            useGameStore.getState().continueTieSpeakers();
          }
        }
      }, 400);
    };

    const handleTieSpeechKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitTieSpeech();
      }
    };

    return (
      <div className="min-h-screen moon-bg p-4 pb-28">
        <div className="max-w-3xl mx-auto animate-fade-in">
          <div className="text-center mb-6">
            <p className="text-amber-400 text-4xl mb-3">⚖️</p>
            <h2 className="text-2xl font-black text-primary-100 glow-text mb-2">平票补发言</h2>
            <p className="text-primary-400 text-sm">
              以下玩家票数相同，需要补充发言后由其他人重新投票：
            </p>
            <div className="flex justify-center gap-2 mt-3">
              {tieIds.map((id, idx) => {
                const p = gameState.players.find(pl => pl.id === id);
                return (
                  <span key={id} className={`px-3 py-1 rounded-lg text-sm font-medium ${
                    idx === tieIdx ? 'bg-accent-500/30 text-accent-300 animate-pulse' :
                    idx < tieIdx ? 'bg-green-500/20 text-green-400' : 'bg-primary-800/40 text-primary-400'
                  }`}>
                    {p?.name} {idx < tieIdx ? '✅' : idx === tieIdx ? '🎤' : ''}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Tie speech chat area */}
          <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 mb-3">
            <h3 className="text-xs font-bold text-primary-300 mb-3">补充发言记录：</h3>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {gameState.discussionMessages
                .filter(m => m.content.includes('【平票补发言】'))
                .slice(-6)
                .map(msg => (
                  <div key={msg.id} className="bg-primary-800/30 rounded-lg px-3 py-2">
                    <span className="text-amber-400 text-xs font-medium">{msg.playerName}:</span>
                    <p className="text-primary-300 text-sm mt-0.5">{msg.content.replace('【平票补发言】', '')}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* Input area */}
          <div className="fixed bottom-0 left-0 right-0 bg-primary-950/95 border-t border-primary-800/50 p-3 z-20">
            <div className="max-w-3xl mx-auto flex gap-3 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleTieSpeechKeyDown}
                  placeholder={isMyTurn ? '请输入你的补充发言... (Enter 发送)' : `等待 ${currentSpeaker?.name || '...'} 发言中...`}
                  disabled={!isMyTurn}
                  className="w-full px-4 py-2.5 bg-primary-800/60 border border-primary-700/50 rounded-xl text-primary-200 text-sm placeholder-primary-600 focus:outline-none focus:border-accent-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <button
                onClick={submitTieSpeech}
                disabled={!message.trim() || !isMyTurn}
                className="px-4 py-2.5 bg-accent-600 hover:bg-accent-500 disabled:bg-primary-700 disabled:text-primary-500 text-primary-950 font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 flex-shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>发言</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'day-vote') {
    const isTieVote = gameState.tiePlayerIds.length > 0;
    const tieVoterIds = new Set(gameState.tiePlayerIds);
    const canVote = !isTieVote || !tieVoterIds.has(userPlayer.id);
    // 可投票的候选人（不能投自己；平票时只能投平票玩家）
    const voteablePlayers = isTieVote
      ? gameState.players.filter(p => p.isAlive && tieVoterIds.has(p.id) && p.id !== userPlayer.id)
      : gameState.players.filter(p => p.isAlive && p.id !== userPlayer.id);

    return (
      <div className="min-h-screen moon-bg p-4">
        <div className="max-w-2xl mx-auto animate-fade-in">
          <div className="text-center mb-6">
            <Gavel className="w-12 h-12 text-accent-400 mx-auto mb-3" />
            <p className="text-primary-500 text-sm tracking-widest mb-1">第 {gameState.round + 1} 天</p>
            <div className="flex items-center justify-center gap-3 mb-2">
              <Vote className="w-7 h-7 text-accent-400" />
              <h2 className="text-2xl font-black text-primary-100 glow-text">
                {isTieVote ? '平票补投' : '投票放逐'}
              </h2>
            </div>
            {isTieVote && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-2">
                <p className="text-amber-400 text-xs">
                  ⚖️ 平票玩家：
                  {gameState.tiePlayerIds.map(id => gameState.players.find(p => p.id === id)?.name).join('、')}
                  （已补发言，不能投票）
                </p>
              </div>
            )}
            <p className="text-primary-400 text-sm">
              {!canVote
                ? '你是平票玩家，不能投票'
                : userVoted ? '你已投票，等待其他玩家投票...' : '选择你想要放逐的玩家（不可投自己）'}
            </p>
          </div>

          {/* Vote progress */}
          <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-primary-300">投票情况：</h3>
              <span className="text-xs text-primary-500">
                {Object.keys(gameState.dayVotes).length} / {gameState.players.filter(p => p.isAlive).length} 人已投票
              </span>
            </div>
            {/* Vote progress bar */}
            <div className="w-full h-2 bg-primary-800 rounded-full mb-4">
              <div
                className="h-full bg-accent-500 rounded-full transition-all duration-500"
                style={{
                  width: `${(Object.keys(gameState.dayVotes).length / gameState.players.filter(p => p.isAlive).length) * 100}%`
                }}
              />
            </div>

            {/* Vote counts */}
            <div className="space-y-2">
              {getVoteCounts(gameState).map(({ name, count, id }) => (
                <div key={id} className="flex items-center justify-between text-sm">
                  <span className="text-primary-300">{name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-primary-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blood-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${(count / Math.max(1, gameState.players.filter(p => p.isAlive).length)) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-blood-400 font-bold w-4 text-right">{count}</span>
                    <span className="text-primary-600 text-xs">票</span>
                  </div>
                </div>
              ))}
              {getVoteCounts(gameState).length === 0 && (
                <p className="text-primary-500 text-sm text-center">暂无投票</p>
              )}
            </div>
          </div>

          {/* Player selection */}
          {!userVoted && canVote && (
            <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-primary-300 mb-3">选择要放逐的玩家：</h3>
              <PlayerList
                players={voteablePlayers}
                onSelect={onVote}
                selectable={true}
              />
              {/* 弃票按钮（平票补投阶段不允许弃票） */}
              {!isTieVote && (
                <div className="text-center mt-4">
                  <button
                    onClick={() => onVote('skip')}
                    className="px-4 py-2 bg-primary-700/50 hover:bg-primary-600/50 text-primary-400 rounded-xl text-sm cursor-pointer transition-all"
                  >
                    弃票
                  </button>
                </div>
              )}
            </div>
          )}

          {!canVote && !userVoted && (
            <div className="text-center mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-amber-400 text-sm">⚖️ 你是平票玩家，本轮补投不能投票</p>
            </div>
          )}

          {userVoted && (
            <div className="text-center mt-4">
              <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-primary-500 text-sm mt-3">等待其他玩家完成投票...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'day-result') {
    // 构建投票详情：voterId -> { voterName, targetName }
    const voteDetails = Object.entries(gameState.previousDayVotes || {}).map(([voterId, targetId]) => {
      const voter = gameState.players.find(p => p.id === voterId);
      const target = gameState.players.find(p => p.id === targetId);
      return {
        voterName: voter?.name || '未知',
        targetName: targetId === 'skip' ? '弃票' : (target?.name || '未知'),
      };
    });

    return (
      <div className="min-h-screen moon-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center animate-fade-in">
          <Gavel className="w-16 h-16 text-accent-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-primary-100 glow-text mb-2">投票结果</h2>

          {/* Show vote details: who voted for whom */}
          {voteDetails.length > 0 && (
            <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5 mt-4">
              <h3 className="text-sm font-bold text-primary-300 mb-3">📊 投票详情：</h3>
              <div className="space-y-2">
                {voteDetails.map((vd, idx) => (
                  <div key={idx} className="text-sm bg-primary-800/30 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-primary-300 font-medium">{vd.voterName}</span>
                      <span className="text-primary-500 text-xs mx-2">→</span>
                      <span className={vd.targetName === '弃票' ? 'text-primary-500' : 'text-accent-400 font-medium'}>
                        {vd.targetName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Show last log about exile */}
          <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5 mt-4">
            {gameState.logs
              .filter(l => l.phase === 'day-result' && l.round === gameState.round)
              .slice(-1)
              .map(log => (
                <p key={log.id} className="text-primary-300">{log.message}</p>
              ))}
          </div>

          <button
            onClick={onAdvance}
            className="mt-6 px-8 py-3 text-primary-950 font-bold rounded-xl cursor-pointer transition-all glow-border bg-accent-600 hover:bg-accent-500"
          >
            夜幕降临
          </button>
        </div>
      </div>
    );
  }

  return null;
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

export default DayPhase;
