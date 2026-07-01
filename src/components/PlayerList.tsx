import React from 'react';
import { Player } from '../types/game';
import { ROLE_INFO } from '../utils/gameLogic';
import Avatar from './Avatar';

interface PlayerListProps {
  players: Player[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  selectable?: boolean;
  showRoles?: boolean;
  compact?: boolean;
  highlightWerewolves?: boolean;
  seerResult?: { targetId: string; isWerewolf: boolean } | null;
}

const PlayerList: React.FC<PlayerListProps> = ({
  players,
  selectedId,
  onSelect,
  selectable = false,
  showRoles = false,
  compact = false,
  highlightWerewolves = false,
  seerResult,
}) => {
  return (
    <div className={`grid ${compact ? 'grid-cols-3 gap-2' : 'grid-cols-2 sm:grid-cols-3 gap-3'}`}>
      {players.map(player => {
        const isSelected = selectedId === player.id;
        const isWerewolf = player.role === 'werewolf';
        const seerInfo = seerResult?.targetId === player.id ? seerResult : null;

        return (
          <button
            key={player.id}
            onClick={() => {
              if (selectable && player.isAlive && onSelect) {
                onSelect(player.id);
              }
            }}
            disabled={!selectable || !player.isAlive}
            className={`game-card relative rounded-xl p-3 border transition-all duration-300 ${
              !player.isAlive
                ? 'player-dead border-primary-800/30 bg-primary-900/30 cursor-default'
                : isSelected
                  ? 'border-accent-500 bg-accent-500/10 glow-border'
                  : highlightWerewolves && isWerewolf
                    ? 'border-blood-500/50 bg-blood-500/5'
                    : 'border-primary-700/50 bg-primary-900/40 hover:border-primary-500/50'
            } ${selectable && player.isAlive ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative">
                <Avatar
                  seed={player.avatarSeed}
                  size={compact ? 36 : 44}
                  isAlive={player.isAlive}
                  role={showRoles ? player.role : undefined}
                />
                {player.role === 'werewolf' && highlightWerewolves && player.isAlive && (
                  <span className="absolute -top-1 -right-1 text-xs">🐺</span>
                )}
              </div>
              <span className={`text-xs font-medium truncate w-full text-center ${
                !player.isAlive ? 'text-primary-600' : 'text-primary-300'
              }`}>
                {player.name}
              </span>
              {showRoles && (
                <span className={`text-[10px] ${
                  isWerewolf ? 'text-blood-400' : 'text-green-400'
                }`}>
                  {ROLE_INFO[player.role].name}
                </span>
              )}
              {seerInfo && (
                <span className={`text-[10px] font-bold ${
                  seerInfo.isWerewolf ? 'text-blood-400' : 'text-green-400'
                }`}>
                  {seerInfo.isWerewolf ? '🐺 狼人' : '👤 好人'}
                </span>
              )}
              {!player.isAlive && (
                <span className="text-[10px] text-blood-400">已死亡</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default PlayerList;
