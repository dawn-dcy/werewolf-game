import React, { useState, useEffect } from 'react';
import { Player, Role } from '../types/game';
import { ROLE_INFO } from '../utils/gameLogic';
import { Shield, Moon, Eye, ChevronRight, Sparkles, RefreshCw } from 'lucide-react';
import Avatar from './Avatar';

interface RoleRevealProps {
  player: Player;
  allPlayers: Player[];
  onContinue: () => void;
  onReshuffle: () => void;
}

const roleBorders: Record<Role, string> = {
  werewolf: 'border-blood-500 shadow-[0_0_30px_rgba(220,38,38,0.3)]',
  villager: 'border-primary-500 shadow-[0_0_20px_rgba(120,113,108,0.3)]',
  seer: 'border-purple-500 shadow-[0_0_30px_rgba(139,92,246,0.3)]',
  witch: 'border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)]',
  hunter: 'border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.3)]',
  guard: 'border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.3)]',
};

const RoleReveal: React.FC<RoleRevealProps> = ({ player, allPlayers, onContinue, onReshuffle }) => {
  const [revealed, setRevealed] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const info = ROLE_INFO[player.role];

  // Get werewolf teammates
  const werewolfTeammates = player.role === 'werewolf'
    ? allPlayers.filter(p => p.role === 'werewolf' && p.id !== player.id)
    : [];

  return (
    <div className="min-h-screen moon-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <p className="text-primary-500 text-sm tracking-widest mb-2">身份揭晓</p>
          <h2 className="text-3xl font-black text-primary-100 glow-text">
            你的身份是...
          </h2>
        </div>

        {/* Role card */}
        <div className={`bg-primary-900/80 backdrop-blur-sm border-2 rounded-2xl p-8 text-center transition-all duration-700 ${
          revealed ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        } ${roleBorders[player.role]}`}>
          <div className="text-7xl mb-4">{info.icon}</div>
          <h3 className="text-3xl font-black text-primary-50 mb-2">{info.name}</h3>
          <p className={`text-sm font-medium mb-4 ${
            info.team === 'good' ? 'text-green-400' : 'text-blood-400'
          }`}>
            {info.team === 'good' ? '村民阵营' : '狼人阵营'}
          </p>
          <p className="text-primary-400 text-sm leading-relaxed">{info.description}</p>
        </div>

        {/* Werewolf teammates */}
        {werewolfTeammates.length > 0 && (
          <div className={`mt-4 bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5 transition-all duration-500 ${
            showOthers ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
          }`}>
            <p className="text-blood-400 text-sm font-medium mb-3">你的狼队友：</p>
            <div className="flex gap-3 flex-wrap">
              {werewolfTeammates.map(w => (
                <div key={w.id} className="flex items-center gap-2 bg-primary-800/50 rounded-xl px-3 py-2">
                  <Avatar seed={w.avatarSeed} size={32} role="werewolf" />
                  <span className="text-primary-300 text-sm">{w.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-8 space-y-3">
          {player.role === 'werewolf' && !showOthers && (
            <button
              onClick={() => setShowOthers(true)}
              className="w-full bg-blood-600/20 hover:bg-blood-600/30 border border-blood-600/50 text-blood-300 font-semibold py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              查看狼队友
            </button>
          )}
          <button
            onClick={onContinue}
            className="w-full bg-accent-600 hover:bg-accent-500 text-primary-950 font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer glow-border"
          >
            <Sparkles className="w-5 h-5" />
            开始游戏
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={onReshuffle}
            className="w-full bg-primary-800/50 hover:bg-primary-800/80 border border-primary-600/40 text-primary-300 font-medium py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            重新分配角色
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleReveal;
