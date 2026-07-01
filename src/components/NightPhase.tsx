import React, { useState } from 'react';
import { Moon, Skull, Eye, FlaskConical, Shield, Sparkles, ArrowRight } from 'lucide-react';
import { GameState, Player, Role } from '../types/game';
import PlayerList from './PlayerList';
import { ROLE_INFO } from '../utils/gameLogic';

interface NightPhaseProps {
  gameState: GameState;
  userPlayer: Player;
  onWerewolfTarget: (id: string) => void;
  onSeerTarget: (id: string) => void;
  onWitchAntidote: (use: boolean) => void;
  onWitchPoison: (id: string | null) => void;
  onGuardTarget: (id: string) => void;
  onAdvance: () => void;
}

const NightPhase: React.FC<NightPhaseProps> = ({
  gameState,
  userPlayer,
  onWerewolfTarget,
  onSeerTarget,
  onWitchAntidote,
  onWitchPoison,
  onGuardTarget,
  onAdvance,
}) => {
  const [witchAntidoteDecided, setWitchAntidoteDecided] = useState(false);
  const [witchPoisonTarget, setWitchPoisonTarget] = useState<string | null>(null);

  const phase = gameState.phase;
  const werewolves = gameState.players.filter(p => p.role === 'werewolf' && p.isAlive);
  const allAlive = gameState.players.filter(p => p.isAlive);

  // Get seer check result
  const seerResult = phase === 'night-seer' && gameState.seerCheckTargetId
    ? {
        targetId: gameState.seerCheckTargetId,
        isWerewolf: gameState.players.find(p => p.id === gameState.seerCheckTargetId)?.role === 'werewolf',
      }
    : null;

  // Should user act in this phase?
  const userRole = userPlayer.role;
  const shouldAct =
    (phase === 'night-werewolf' && userRole === 'werewolf' && userPlayer.isAlive) ||
    (phase === 'night-seer' && userRole === 'seer' && userPlayer.isAlive) ||
    (phase === 'night-witch' && userRole === 'witch' && userPlayer.isAlive) ||
    (phase === 'night-guard' && userRole === 'guard' && userPlayer.isAlive);

  // Dead player is handled by SpectatorView in App.tsx
  if (!userPlayer.isAlive) {
    return null;
  }

  if (!shouldAct) {
    // AI is acting - show waiting screen
    const phaseNames: Record<string, string> = {
      'night-summary': '正在生成回合摘要...',
      'night-werewolf': '狼人正在行动...',
      'night-seer': '预言家正在查验...',
      'night-witch': '女巫正在决策...',
      'night-guard': '守卫正在守护...',
      'night-result': '结算夜晚结果...',
    };

    return (
      <div className="min-h-screen moon-bg flex items-center justify-center p-4">
        <div className="text-center animate-fade-in">
          <Moon className="w-16 h-16 text-accent-400 mx-auto mb-4 animate-pulse" />
          <h2 className="text-2xl font-bold text-primary-200 mb-2">
            {phaseNames[phase] || '夜晚阶段'}
          </h2>
          <div className="flex gap-1 justify-center mt-4">
            <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
            <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
          </div>
        </div>
      </div>
    );
  }

  // Render appropriate UI based on phase and role
  if (phase === 'night-werewolf' && userRole === 'werewolf') {
    const aiWerewolves = werewolves.filter(p => p.id !== userPlayer.id && p.isAI);
    const isWaitingForTeammates = gameState.werewolfTargetId && aiWerewolves.length > 0;

    if (isWaitingForTeammates) {
      // 等待 AI 狼队友投票
      return (
        <NightActionWrapper
          title="狼人请行动"
          subtitle="等待狼队友投票..."
          icon={<Skull className="w-8 h-8 text-blood-400" />}
          description={`你选择了击杀 ${gameState.players.find(p => p.id === gameState.werewolfTargetId)?.name}，正在等待其他狼人投票...`}
        >
          <div className="text-center py-8">
            <div className="flex gap-1 justify-center mb-4">
              <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
              <div className="w-2 h-2 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
            </div>
            <p className="text-primary-500 text-sm">
              狼队友：{aiWerewolves.map(w => w.name).join('、')} 正在投票中...
            </p>
          </div>
        </NightActionWrapper>
      );
    }

    return (
      <NightActionWrapper
        title="狼人请行动"
        subtitle="选择今晚要击杀的目标"
        icon={<Skull className="w-8 h-8 text-blood-400" />}
        description={`你的狼队友：${werewolves.filter(p => p.id !== userPlayer.id).map(w => w.name).join('、') || '（你是唯一的狼人）'}`}
      >
        <PlayerList
          players={allAlive}
          selectedId={gameState.werewolfTargetId}
          onSelect={onWerewolfTarget}
          selectable={!gameState.werewolfTargetId}
        />
        {gameState.werewolfTargetId && aiWerewolves.length === 0 && (
          <div className="text-center mt-4">
            <button onClick={onAdvance} className="px-6 py-2 bg-accent-600 hover:bg-accent-500 text-primary-950 font-bold rounded-xl cursor-pointer transition-all">
              确认击杀
            </button>
          </div>
        )}
      </NightActionWrapper>
    );
  }

  if (phase === 'night-seer' && userRole === 'seer') {
    return (
      <NightActionWrapper
        title="预言家请行动"
        subtitle="选择要查验的玩家"
        icon={<Eye className="w-8 h-8 text-purple-400" />}
      >
        <PlayerList
          players={gameState.players.filter(p => p.isAlive && p.id !== userPlayer.id)}
          selectedId={gameState.seerCheckTargetId}
          onSelect={onSeerTarget}
          selectable={!gameState.seerCheckTargetId}
          seerResult={seerResult}
        />
        {seerResult && (
          <div className={`mt-4 p-4 rounded-xl text-center ${
            seerResult.isWerewolf ? 'bg-blood-500/10 border border-blood-500/30' : 'bg-green-500/10 border border-green-500/30'
          }`}>
            <p className={`font-bold text-lg mb-2 ${seerResult.isWerewolf ? 'text-blood-400' : 'text-green-400'}`}>
              {seerResult.isWerewolf ? '🐺 该玩家是狼人！' : '👤 该玩家是好人'}
            </p>
            <p className="text-primary-500 text-xs mb-3">
              查验结果已显示，请牢记此信息，白天讨论时可以使用
            </p>
            <button onClick={onAdvance} className="px-6 py-2 bg-accent-600 hover:bg-accent-500 text-primary-950 font-bold rounded-xl cursor-pointer transition-all">
              确认，进入下一阶段
            </button>
          </div>
        )}
      </NightActionWrapper>
    );
  }

  if (phase === 'night-witch' && userRole === 'witch') {
    return (
      <NightActionWrapper
        title="女巫请行动"
        subtitle="选择是否使用药水"
        icon={<FlaskConical className="w-8 h-8 text-cyan-400" />}
      >
        {/* Antidote section */}
        {userPlayer.hasAntidote && !witchAntidoteDecided && gameState.werewolfTargetId && (
          <div className="bg-primary-800/50 border border-primary-700/50 rounded-xl p-4 mb-4">
            <p className="text-primary-300 text-sm mb-3">
              昨晚 <strong className="text-blood-400">{gameState.players.find(p => p.id === gameState.werewolfTargetId)?.name}</strong> 死了
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onWitchAntidote(true);
                  setWitchAntidoteDecided(true);
                }}
                className="flex-1 py-2.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-600/50 text-cyan-300 rounded-xl font-medium cursor-pointer transition-all"
              >
                🧪 使用解药救活
              </button>
              <button
                onClick={() => {
                  onWitchAntidote(false);
                  setWitchAntidoteDecided(true);
                }}
                className="flex-1 py-2.5 bg-primary-700/50 hover:bg-primary-600/50 text-primary-400 rounded-xl cursor-pointer transition-all"
              >
                不使用
              </button>
            </div>
          </div>
        )}

        {/* Poison section */}
        {(!userPlayer.hasAntidote && gameState.werewolfTargetId) && (
          <div className="bg-primary-800/30 border border-primary-700/30 rounded-xl p-3 mb-4 text-center">
            <p className="text-primary-500 text-xs">
              ⚠️ 解药已使用，无法得知当夜的击杀目标（不知道刀口）
            </p>
          </div>
        )}

        {/* Poison section */}
        {(witchAntidoteDecided || !userPlayer.hasAntidote || !gameState.werewolfTargetId) && userPlayer.hasPoison && (
          <div>
            <p className="text-primary-400 text-sm mb-3">
              {witchPoisonTarget === null ? '是否使用毒药毒杀一名玩家？' : '点击确认使用毒药'}
            </p>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setWitchPoisonTarget(witchPoisonTarget ? null : 'selecting')}
                className={`flex-1 py-2.5 rounded-xl font-medium cursor-pointer transition-all ${
                  witchPoisonTarget
                    ? 'bg-cyan-600/20 border border-cyan-600/50 text-cyan-300'
                    : 'bg-primary-700/50 hover:bg-primary-600/50 text-primary-400'
                }`}
              >
                ☠️ {witchPoisonTarget ? '取消使用毒药' : '使用毒药'}
              </button>
              <button
                onClick={() => {
                  onWitchPoison(null);
                  onAdvance();
                }}
                className="flex-1 py-2.5 bg-primary-700/50 hover:bg-primary-600/50 text-primary-400 rounded-xl cursor-pointer transition-all"
              >
                不使用毒药，进入白天
              </button>
            </div>

            {witchPoisonTarget === 'selecting' && (
              <PlayerList
                players={gameState.players.filter(p => p.isAlive && p.id !== userPlayer.id)}
                onSelect={(id) => setWitchPoisonTarget(id)}
                selectable={true}
              />
            )}

            {witchPoisonTarget && witchPoisonTarget !== 'selecting' && (
              <div className="text-center mt-4">
                <p className="text-blood-400 text-sm mb-3">
                  将对 <strong>{gameState.players.find(p => p.id === witchPoisonTarget)?.name}</strong> 使用毒药
                </p>
                <button
                  onClick={() => {
                    onWitchPoison(witchPoisonTarget);
                    onAdvance();
                  }}
                  className="px-6 py-2 bg-blood-600 hover:bg-blood-500 text-white font-bold rounded-xl cursor-pointer transition-all"
                >
                  确认毒杀
                </button>
              </div>
            )}
          </div>
        )}

        {(!userPlayer.hasAntidote || witchAntidoteDecided) && !userPlayer.hasPoison && (
          <div className="text-center text-primary-500">
            <p>你已使用全部药水</p>
            <button onClick={onAdvance} className="mt-4 px-6 py-2 bg-accent-600 hover:bg-accent-500 text-primary-950 font-bold rounded-xl cursor-pointer transition-all">
              进入白天
            </button>
          </div>
        )}
      </NightActionWrapper>
    );
  }

  if (phase === 'night-guard' && userRole === 'guard') {
    return (
      <NightActionWrapper
        title="守卫请行动"
        subtitle="选择今晚要守护的玩家"
        icon={<Shield className="w-8 h-8 text-green-400" />}
        description={userPlayer.lastGuardedId ? `上次守护了 ${gameState.players.find(p => p.id === userPlayer.lastGuardedId)?.name}，不能连续守护同一人` : undefined}
      >
        <PlayerList
          players={gameState.players.filter(p => p.isAlive && p.id !== userPlayer.lastGuardedId)}
          selectedId={gameState.guardProtectTargetId}
          onSelect={onGuardTarget}
          selectable={true}
        />
      </NightActionWrapper>
    );
  }

  return null;
};

// Wrapper for night phase UI
const NightActionWrapper: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  description?: string;
}> = ({ title, subtitle, icon, children, description }) => (
  <div className="min-h-screen moon-bg p-4">
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="text-center mb-6">
        <Moon className="w-12 h-12 text-accent-400 mx-auto mb-3" />
        <p className="text-primary-500 text-sm tracking-widest mb-1">第N夜</p>
        <div className="flex items-center justify-center gap-3 mb-2">
          {icon}
          <h2 className="text-2xl font-black text-primary-100 glow-text">{title}</h2>
        </div>
        <p className="text-primary-400 text-sm">{subtitle}</p>
        {description && (
          <p className="text-primary-500 text-xs mt-2">{description}</p>
        )}
      </div>
      <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-5">
        {children}
      </div>
    </div>
  </div>
);

export default NightPhase;
