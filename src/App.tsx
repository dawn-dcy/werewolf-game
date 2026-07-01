import React, { useState } from 'react';
import { useGameStore } from './store/gameStore';
import LoginPage from './components/LoginPage';
import Lobby from './components/Lobby';
import RoleReveal from './components/RoleReveal';
import NightPhase from './components/NightPhase';
import DayPhase from './components/DayPhase';
import GameOver from './components/GameOver';
import SpectatorView from './components/SpectatorView';
import AISettings from './components/AISettings';
import GodView from './components/GodView';
import HunterShoot from './components/HunterShoot';

const App: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);

  const {
    username, isLoggedIn,
    setUsername, login, logout,
    gameState, selectedPlayerCount,
    selectPlayerCount, startGame, reshuffleRoles,
    advancePhase,
    selectWerewolfTarget, selectSeerTarget,
    witchUseAntidote, witchUsePoison,
    selectGuardTarget, selectHunterTarget,
    castVote,
    sendDiscussionMessage,
    resetGame,
    restartGame,
  } = useGameStore();

  // Login page
  if (!isLoggedIn) {
    return (
      <>
        <LoginPage
          username={username}
          setUsername={setUsername}
          onLogin={login}
          onOpenSettings={() => setShowSettings(true)}
        />
        <AISettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </>
    );
  }

  // Lobby
  if (!gameState || gameState.phase === 'lobby') {
    return (
      <>
        <Lobby
          username={username}
          selectedCount={selectedPlayerCount}
          onSelectCount={selectPlayerCount}
          onStartGame={startGame}
          onLogout={logout}
          onOpenSettings={() => setShowSettings(true)}
        />
        <AISettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </>
    );
  }

  // Role reveal
  if (gameState.phase === 'role-reveal') {
    const userPlayer = gameState.players.find(p => !p.isAI)!;
    return (
      <RoleReveal
        player={userPlayer}
        allPlayers={gameState.players}
        onContinue={() => advancePhase()}
        onReshuffle={() => reshuffleRoles()}
      />
    );
  }

  // Game over
  if (gameState.phase === 'game-over') {
    return (
      <div className="relative min-h-screen">
        <GameOver
          gameState={gameState}
          username={username}
          onRestart={() => {
            restartGame();
            setTimeout(() => startGame(), 100);
          }}
          onGoHome={() => resetGame()}
        />
        <GodView gameState={gameState} />
      </div>
    );
  }

  // Hunter shoot phase — human hunter chooses target after death
  if (gameState.phase === 'hunter-shoot') {
    return (
      <div className="relative min-h-screen">
        <HunterShoot gameState={gameState} onSelectTarget={selectHunterTarget} />
        <GodView gameState={gameState} />
      </div>
    );
  }

  // Game phases (night/day)
  const isNightPhase = gameState.phase.startsWith('night-');
  const userPlayer = gameState.players.find(p => !p.isAI)!;

  // Dead player → spectator view (always with GodView)
  if (!userPlayer.isAlive) {
    return (
      <div className="relative min-h-screen">
        <SpectatorView gameState={gameState} onAdvance={advancePhase} />
        <GodView gameState={gameState} />
      </div>
    );
  }

  if (isNightPhase) {
    return (
      <div className="relative min-h-screen">
        <NightPhase
          gameState={gameState}
          userPlayer={userPlayer}
          onWerewolfTarget={selectWerewolfTarget}
          onSeerTarget={selectSeerTarget}
          onWitchAntidote={witchUseAntidote}
          onWitchPoison={witchUsePoison}
          onGuardTarget={selectGuardTarget}
          onAdvance={advancePhase}
        />
        <GodView gameState={gameState} />
      </div>
    );
  }

  // Day phases
  return (
    <div className="relative min-h-screen">
      <DayPhase
        gameState={gameState}
        userPlayer={userPlayer}
        onVote={castVote}
        onAdvance={advancePhase}
        onSendMessage={sendDiscussionMessage}
      />
      <GodView gameState={gameState} />
    </div>
  );
};

export default App;
