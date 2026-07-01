import React from 'react';
import { LogIn, Settings } from 'lucide-react';

interface LoginPageProps {
  username: string;
  setUsername: (name: string) => void;
  onLogin: () => void;
  onOpenSettings: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ username, setUsername, onLogin, onOpenSettings }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin();
    }
  };

  return (
    <div className="min-h-screen moon-bg flex items-center justify-center p-4">
      {/* Decorative elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-1/4 w-64 h-64 rounded-full bg-accent-600/5 blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 rounded-full bg-blood-600/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🐺</div>
          <h1 className="text-4xl font-black text-primary-50 glow-text tracking-wider">
            狼人杀
          </h1>
          <p className="text-primary-400 mt-2 text-sm tracking-widest">
            WEREWOLF ONLINE
          </p>
          <p className="text-primary-500 mt-3 text-sm">
            与AI对手一决高下，体验推理的乐趣
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-primary-900/80 backdrop-blur-sm border border-primary-700/50 rounded-2xl p-6 glow-card">
            <label className="block text-primary-300 text-sm font-medium mb-2 tracking-wide">
              输入你的昵称
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入昵称..."
              maxLength={12}
              className="w-full bg-primary-800 border border-primary-600/50 rounded-xl px-4 py-3 text-primary-50 placeholder-primary-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all duration-300"
              autoFocus
            />
            <button
              type="submit"
              disabled={!username.trim()}
              className="w-full mt-4 bg-accent-600 hover:bg-accent-500 disabled:bg-primary-700 disabled:text-primary-500 text-primary-950 font-bold py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <LogIn className="w-5 h-5" />
              进入游戏
            </button>
          </div>
        </form>

        {/* AI Settings button */}
        <div className="text-center mt-4">
          <button
            onClick={onOpenSettings}
            className="text-primary-500 hover:text-accent-400 text-sm transition-colors cursor-pointer flex items-center gap-1.5 mx-auto"
          >
            <Settings className="w-4 h-4" />
            配置大模型 API
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-4 text-primary-600 text-xs">
          支持 6-12 人游戏 · 多种身份角色 · 智能AI对手
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
