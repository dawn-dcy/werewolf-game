import React from 'react';
import { Crosshair, Skull } from 'lucide-react';
import { GameState } from '../types/game';

interface HunterShootProps {
  gameState: GameState;
  onSelectTarget: (targetId: string) => void;
}

export const getAIName = (name: string): string => name.replace(/\(你\)$/, '');

const HunterShoot: React.FC<HunterShootProps> = ({ gameState, onSelectTarget }) => {
  const pending = gameState.hunterShootPending;
  if (!pending) return null;

  const hunter = gameState.players.find(p => p.id === pending.hunterId);
  // 可选目标：存活的、不是猎人自己的其他玩家
  const targets = gameState.players.filter(p => p.isAlive && p.id !== pending.hunterId);

  const deathReason = pending.returnPhase === 'night-result'
    ? '在夜晚死亡'
    : '被投票放逐';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-primary-900 border border-orange-500/40 rounded-2xl w-full max-w-md animate-fade-in shadow-2xl shadow-orange-500/20">
        {/* Header */}
        <div className="p-6 text-center border-b border-orange-500/20">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mx-auto mb-3">
            <Crosshair className="w-8 h-8 text-orange-400" />
          </div>
          <h2 className="text-xl font-bold text-orange-400 mb-1">猎人遗言</h2>
          <p className="text-sm text-primary-400">
            {hunter ? getAIName(hunter.name) : '你'}{deathReason}，可以在临死前开枪带走一名存活玩家！
          </p>
        </div>

        {/* Target selection */}
        <div className="p-5">
          <p className="text-xs font-medium text-primary-500 mb-3 flex items-center gap-1.5">
            <Skull className="w-3.5 h-3.5 text-blood-400" />
            选择你要带走的玩家（不可跳过）：
          </p>

          {targets.length === 0 ? (
            <p className="text-sm text-primary-500 text-center py-8">没有可以带走的目标</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {targets.map(target => {
                const isAI = target.isAI;
                return (
                  <button
                    key={target.id}
                    onClick={() => onSelectTarget(target.id)}
                    className="w-full flex items-center gap-3 bg-primary-800/60 hover:bg-orange-500/20 border border-primary-700/50 hover:border-orange-500/50 rounded-xl px-4 py-3 transition-all group cursor-pointer text-left"
                  >
                    {/* Avatar placeholder */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                      isAI
                        ? 'bg-primary-700 text-primary-400 group-hover:bg-orange-500/30 group-hover:text-orange-300'
                        : 'bg-accent-500/20 text-accent-400'
                    }`}>
                      {target.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-primary-200 group-hover:text-orange-300 truncate">
                        {getAIName(target.name)}
                      </div>
                      <div className="text-[10px] text-primary-500">
                        {isAI ? 'AI 玩家' : '人类玩家'}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Crosshair className="w-5 h-5 text-orange-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 pb-5 text-center">
          <p className="text-[10px] text-primary-600">
            猎人的枪声，将改变战局 — 选择后不可撤回
          </p>
        </div>
      </div>
    </div>
  );
};

export default HunterShoot;
