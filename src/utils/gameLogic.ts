import { Role, GameConfig } from '../types/game';

// Role display names and descriptions
export const ROLE_INFO: Record<Role, { name: string; icon: string; description: string; team: 'good' | 'evil' }> = {
  werewolf: {
    name: '狼人',
    icon: '🐺',
    description: '每晚可以击杀一名玩家，目标是消灭所有村民阵营的玩家。',
    team: 'evil',
  },
  villager: {
    name: '村民',
    icon: '👤',
    description: '没有任何特殊技能，通过推理和投票找出狼人。',
    team: 'good',
  },
  seer: {
    name: '预言家',
    icon: '🔮',
    description: '每晚可以查验一名玩家的身份，得知其是好人还是狼人。',
    team: 'good',
  },
  witch: {
    name: '女巫',
    icon: '🧪',
    description: '拥有一瓶解药和一瓶毒药。解药可以救活被狼人杀害的玩家，毒药可以毒杀一名玩家。每瓶药只能使用一次。',
    team: 'good',
  },
  hunter: {
    name: '猎人',
    icon: '🏹',
    description: '被投票放逐或被狼人杀害时，可以开枪带走一名玩家。夜晚死亡开枪不暴露身份（无声），白天被放逐开枪会公开猎人身份及带走谁。',
    team: 'good',
  },
  guard: {
    name: '守卫',
    icon: '🛡️',
    description: '每晚可以守护一名玩家（包括自己），使其当晚不会被狼人杀死。不能连续两晚守护同一名玩家。',
    team: 'good',
  },
};

// Get role distribution based on player count
export function getRoleDistribution(playerCount: number): GameConfig {
  const configs: Record<number, Record<Role, number>> = {
    6: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
    7: { werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 0, guard: 0 },
    8: { werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 0 },
    9: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 0 },
    10: { werewolf: 3, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 0 },
    11: { werewolf: 3, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 1 },
    12: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 1 },
  };

  const dist = configs[playerCount] || configs[6];
  return { playerCount, roleDistribution: dist };
}

// Generate AI player names - simple numbered names
export function generateAINames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${i + 1}号`);
}

// Shuffle and assign roles
export function shuffleRoles(config: GameConfig): Role[] {
  const roles: Role[] = [];
  const dist = config.roleDistribution;
  (Object.keys(dist) as Role[]).forEach(role => {
    for (let i = 0; i < dist[role]; i++) {
      roles.push(role);
    }
  });
  // Fisher-Yates shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

// Generate seed for dicebear avatars
export function generateAvatarSeed(): number {
  return Math.floor(Math.random() * 100);
}

// Check game over condition (屠边规则：狼人杀死所有神职或所有村民即胜利)
export function checkGameOver(players: { role: Role; isAlive: boolean }[]): 'werewolf-win' | 'villager-win' | null {
  const aliveWerewolves = players.filter(p => p.role === 'werewolf' && p.isAlive).length;
  // 神职：预言家、女巫、猎人、守卫
  const godRoles: Role[] = ['seer', 'witch', 'hunter', 'guard'];
  const aliveGods = players.filter(p => godRoles.includes(p.role) && p.isAlive).length;
  const aliveVillagers = players.filter(p => p.role === 'villager' && p.isAlive).length;

  if (aliveWerewolves === 0) return 'villager-win';
  // 屠边：所有神职死亡 或 所有村民死亡
  if (aliveGods === 0 || aliveVillagers === 0) return 'werewolf-win';
  return null;
}
