import React from 'react';
import { Users, ChevronRight, LogOut, Settings } from 'lucide-react';

interface LobbyProps {
  username: string;
  selectedCount: number | null;
  onSelectCount: (count: number) => void;
  onStartGame: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

const playerCounts = [6, 7, 8, 9, 10, 11, 12];

const roleInfoByCount: Record<number, string> = {
  6: '2狼人 · 2村民 · 预言家 · 女巫',
  7: '2狼人 · 3村民 · 预言家 · 女巫',
  8: '2狼人 · 3村民 · 预言家 · 女巫 · 猎人',
  9: '3狼人 · 3村民 · 预言家 · 女巫 · 猎人',
  10: '3狼人 · 4村民 · 预言家 · 女巫 · 猎人',
  11: '3狼人 · 4村民 · 预言家 · 女巫 · 猎人 · 守卫',
  12: '4狼人 · 4村民 · 预言家 · 女巫 · 猎人 · 守卫',
};

const Lobby: React.FC<LobbyProps> = ({ username, selectedCount, onSelectCount, onStartGame, onLogout, onOpenSettings }) => {
  return (
    <div className="min-h-screen moon-bg p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🐺</span>
            <div>
              <h1 className="text-2xl font-black text-primary-50 glow-text">狼人杀</h1>
              <p className="text-primary-500 text-xs">WEREWOLF ONLINE</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onOpenSettings}
              className="text-primary-500 hover:text-accent-400 transition-colors cursor-pointer"
              title="AI 设置"
            >
              <Settings className="w-5 h-5" />
            </button>
            <span className="text-primary-300 text-sm">欢迎，<strong className="text-accent-400">{username}</strong></span>
            <button
              onClick={onLogout}
              className="text-primary-500 hover:text-primary-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="mt-8 animate-fade-in">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-primary-100 mb-2">选择游戏人数</h2>
            <p className="text-primary-400">系统将自动分配身份，你和其他AI玩家将展开一场智慧对决</p>
          </div>

          {/* Player count grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {playerCounts.map(count => (
              <button
                key={count}
                onClick={() => onSelectCount(count)}
                className={`game-card relative p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer ${
                  selectedCount === count
                    ? 'border-accent-500 bg-accent-500/10 glow-border'
                    : 'border-primary-700/50 bg-primary-900/60 hover:border-primary-500/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Users className={`w-5 h-5 ${selectedCount === count ? 'text-accent-400' : 'text-primary-500'}`} />
                  <span className={`text-2xl font-bold ${selectedCount === count ? 'text-accent-400' : 'text-primary-200'}`}>
                    {count}
                  </span>
                  <span className="text-primary-500 text-sm">人局</span>
                </div>
                <p className="text-primary-500 text-xs text-left leading-relaxed">
                  {roleInfoByCount[count]}
                </p>
                {selectedCount === count && (
                  <div className="absolute top-2 right-2 w-3 h-3 bg-accent-500 rounded-full animate-pulse-glow" />
                )}
              </button>
            ))}
          </div>

          {/* Start button */}
          <div className="text-center">
            <button
              onClick={onStartGame}
              disabled={!selectedCount}
              className="px-10 py-4 bg-accent-600 hover:bg-accent-500 disabled:bg-primary-800 disabled:text-primary-600 text-primary-950 font-bold text-lg rounded-2xl transition-all duration-300 flex items-center gap-2 mx-auto cursor-pointer disabled:cursor-not-allowed glow-border"
            >
              开始游戏
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Game rules */}
        <div className="mt-12 bg-primary-900/50 border border-primary-800/50 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-primary-200 mb-4">游戏规则简介</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-primary-400">
            <div className="space-y-2">
              <p><strong className="text-blood-400">🐺 狼人阵营：</strong>每晚击杀一名玩家，目标是消灭所有村民阵营玩家。</p>
              <p><strong className="text-primary-300">👤 村民阵营：</strong>通过推理找出并放逐所有狼人。</p>
              <p><strong className="text-purple-400">🔮 预言家：</strong>每晚可以查验一名玩家的身份。</p>
            </div>
            <div className="space-y-2">
              <p><strong className="text-cyan-400">🧪 女巫：</strong>拥有一瓶解药和一瓶毒药，各可使用一次。</p>
              <p><strong className="text-orange-400">🏹 猎人：</strong>被放逐或杀害时可以开枪带走一人。夜晚死亡时开枪不暴露身份，白天被放逐时会公开猎人身份。</p>
              <p><strong className="text-green-400">🛡️ 守卫：</strong>每晚可守护一名玩家，不能连续守同一人。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
