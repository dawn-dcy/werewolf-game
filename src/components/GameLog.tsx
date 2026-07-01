import React from 'react';
import { ScrollText } from 'lucide-react';
import { GameLog as GameLogType } from '../types/game';

interface GameLogProps {
  logs: GameLogType[];
}

const GameLog: React.FC<GameLogProps> = ({ logs }) => {
  return (
    <div className="bg-primary-900/60 border border-primary-800/50 rounded-2xl p-4 max-h-52 overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <ScrollText className="w-4 h-4 text-primary-500" />
        <h3 className="text-sm font-bold text-primary-300">游戏日志</h3>
      </div>
      <div className="space-y-1.5 text-xs">
        {logs.slice(-8).map(log => (
          <div key={log.id} className="flex gap-2 animate-fade-in">
            <span className="text-primary-600 flex-shrink-0">[D{log.round + 1}]</span>
            <span className="text-primary-400">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GameLog;
