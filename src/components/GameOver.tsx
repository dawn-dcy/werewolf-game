import React, { useEffect, useState } from 'react';
import { Trophy, RotateCcw, Home, Award, Loader2 } from 'lucide-react';
import { GameState } from '../types/game';
import PlayerList from './PlayerList';

interface GameOverProps {
  gameState: GameState;
  username: string;
  onRestart: () => void;
  onGoHome: () => void;
}

const GameOver: React.FC<GameOverProps> = ({ gameState, username, onRestart, onGoHome }) => {
  const userPlayer = gameState.players.find(p => !p.isAI);
  const isVictory =
    (gameState.gameResult === 'villager-win' && userPlayer?.role !== 'werewolf') ||
    (gameState.gameResult === 'werewolf-win' && userPlayer?.role === 'werewolf');

  return (
    <div className="min-h-screen moon-bg flex items-center justify-center p-4">
      <div className="max-w-2xl w-full animate-fade-in">
        {/* Result header */}
        <div className="text-center mb-8">
          <div className="text-7xl mb-4">
            {isVictory ? '🎉' : '💔'}
          </div>
          <h1 className={`text-4xl font-black mb-2 ${
            isVictory ? 'text-accent-400 glow-text' : 'text-blood-400'
          }`}>
            {isVictory ? '恭喜胜利！' : '游戏结束'}
          </h1>
          <p className="text-primary-400 text-lg">
            {gameState.gameResult === 'werewolf-win' ? '狼人阵营获胜！' : '村民阵营获胜！'}
          </p>
          {isVictory && (
            <div className="mt-4 inline-flex items-center gap-2 bg-accent-500/10 border border-accent-500/30 rounded-full px-4 py-1.5">
              <Trophy className="w-4 h-4 text-accent-400" />
              <span className="text-accent-400 text-sm font-medium">你赢得了这场游戏</span>
            </div>
          )}
        </div>

        {/* All players reveal */}
        <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-bold text-primary-300 mb-4 text-center">身份揭晓</h3>
          <PlayerList players={gameState.players} showRoles />
        </div>

        {/* MVP 评选 */}
        <div className="bg-primary-900/60 border border-amber-500/30 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-bold text-amber-400 mb-4 flex items-center gap-2">
            <Award className="w-4 h-4" /> 本局 MVP
          </h3>
          {gameState.mvpPlayerId && gameState.mvpReason ? (
            (() => {
              const mvpPlayer = gameState.players.find(p => p.id === gameState.mvpPlayerId);
              if (!mvpPlayer) return null;
              return (
                <div className="flex items-start gap-3">
                  <div className="text-4xl flex-shrink-0">🏆</div>
                  <div className="flex-1">
                    <p className="text-lg font-bold text-amber-300">{mvpPlayer.name.replace(/\(你\)$/, '')}</p>
                    <p className="text-primary-300 text-sm mt-1 leading-relaxed">{gameState.mvpReason}</p>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex items-center gap-2 text-primary-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在评选中...
            </div>
          )}
        </div>

        {/* Game stats */}
        <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-bold text-primary-300 mb-3">游戏统计</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-accent-400">{gameState.round + 1}</p>
              <p className="text-primary-500 text-xs">总轮数</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-400">
                {gameState.players.filter(p => !p.isAlive).length}
              </p>
              <p className="text-primary-500 text-xs">死亡人数</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-400">
                {gameState.players.filter(p => p.isAlive).length}
              </p>
              <p className="text-primary-500 text-xs">存活人数</p>
            </div>
          </div>
        </div>

        {/* Game log */}
        <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5 mb-6 max-h-48 overflow-y-auto">
          <h3 className="text-sm font-bold text-primary-300 mb-3">游戏日志</h3>
          <div className="space-y-1.5 text-xs">
            {gameState.logs.map(log => (
              <div key={log.id} className="flex gap-2">
                <span className="text-primary-600">[{log.round + 1}]</span>
                <span className="text-primary-400">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onRestart}
            className="flex-1 py-3 bg-accent-600 hover:bg-accent-500 text-primary-950 font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 glow-border"
          >
            <RotateCcw className="w-5 h-5" />
            再来一局
          </button>
          <button
            onClick={onGoHome}
            className="flex-1 py-3 bg-primary-800 hover:bg-primary-700 text-primary-300 font-medium rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            返回大厅
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameOver;
