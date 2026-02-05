import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ADJACENCY,
  BASE_POINTS,
  LAYOUT,
  POWERUP_ORDER,
  STOCK_BONUS,
  createGameState,
  getExposedIds,
  isAdjacentRank,
  isExposed,
  rankLabel,
  type GameState,
  type Card,
  type Powerup,
  type Slot,
  type Suit,
} from './game'

type ClearResult = {
  state: GameState
  clearedCount: number
}

export default function App() {
  const initialSeed = useMemo(() => generateRandomSeed(), [])
  const [seedInput, setSeedInput] = useState(initialSeed)
  const [seedLocked, setSeedLocked] = useState(false)
  const [game, setGame] = useState(() => createGameState(initialSeed))
  const [history, setHistory] = useState<GameState[]>([])
  const [invalidCardId, setInvalidCardId] = useState<number | null>(null)
  const [invalidToken, setInvalidToken] = useState(0)
  const invalidTimeout = useRef<number | null>(null)
  const isNarrow = useMediaQuery('(max-width: 980px)')

  const exposedIds = useMemo(() => getExposedIds(game.tableau), [game.tableau])
  const exposedSet = useMemo(() => new Set(exposedIds), [exposedIds])
  const wasteTop = game.waste[game.waste.length - 1]

  const comboMultiplier = useMemo(() => getComboMultiplier(game.combo), [game.combo])
  const boardCols = useMemo(
    () => Math.max(...LAYOUT.map((slot) => slot.x)) + 1,
    [],
  )
  const canUndo = history.length > 0
  const canHold = game.status === 'playing' && game.waste.length > 0
  const [showCovered, setShowCovered] = useState(false)
  const [highlightPlayable, setHighlightPlayable] = useState(true)

  function triggerInvalid(slotId: number) {
    if (invalidTimeout.current) window.clearTimeout(invalidTimeout.current)
    setInvalidCardId(slotId)
    setInvalidToken((token) => token + 1)
    if ('vibrate' in navigator) navigator.vibrate(10)
    invalidTimeout.current = window.setTimeout(() => setInvalidCardId(null), 320)
  }

  function commitState(prev: GameState, next: GameState): GameState {
    if (next === prev) return prev
    setHistory((stack) => [...stack, prev])
    return next
  }

  function startNewGame() {
    const trimmed = seedInput.trim()
    const useSeed = seedLocked && trimmed.length > 0
    const seed = useSeed ? trimmed : generateRandomSeed()
    setHistory([])
    setGame(createGameState(seed))
    if (!useSeed) {
      setSeedLocked(false)
      setSeedInput(seed)
    }
  }

  function togglePowerup(powerup: Powerup) {
    setGame((prev) => {
      if (prev.status !== 'playing') return prev
      if (prev.powerups[powerup] <= 0) return prev
      const nextActive = prev.activePowerup === powerup ? null : powerup
      return { ...prev, activePowerup: nextActive }
    })
  }

  function undo() {
    setHistory((stack) => {
      if (stack.length === 0) return stack
      const previous = stack[stack.length - 1]
      setGame(previous)
      return stack.slice(0, -1)
    })
  }

  function toggleWrap(enabled: boolean) {
    setGame((prev) => {
      if (prev.wrapEnabled === enabled) return prev
      const next: GameState = { ...prev, wrapEnabled: enabled }
      return commitState(prev, next)
    })
  }

  function drawFromStock() {
    setGame((prev) => {
      if (prev.status !== 'playing') return prev
      if (prev.stock.length === 0) return prev
      const stock = [...prev.stock]
      const drawn = stock.pop()
      if (!drawn) return prev
      const next: GameState = {
        ...prev,
        stock,
        waste: [...prev.waste, drawn],
        combo: 0,
        activePowerup: null,
      }
      return commitState(prev, evaluateState(next))
    })
  }

  function useHold() {
    setGame((prev) => {
      if (prev.status !== 'playing') return prev
      if (prev.waste.length === 0) return prev
      const nextWaste = [...prev.waste]
      const wasteTop = nextWaste.pop()
      if (!wasteTop) return prev
      let hold = prev.hold
      if (hold) {
        nextWaste.push(hold)
      }
      hold = wasteTop
      const next: GameState = {
        ...prev,
        waste: nextWaste,
        hold,
        combo: 0,
        activePowerup: null,
      }
      return commitState(prev, evaluateState(next))
    })
  }

  function handleCardClick(slotId: number) {
    setGame((prev) => {
      if (prev.status !== 'playing') return prev
      const slot = prev.tableau[slotId]
      if (!slot?.card) return prev
      if (!isExposed(slot, prev.tableau)) return prev
      const activePowerup = prev.activePowerup
      const currentExposedIds = getExposedIds(prev.tableau)
      const currentExposedSet = new Set(currentExposedIds)
      const currentWasteTop = prev.waste[prev.waste.length - 1]

      if (!activePowerup) {
        if (!currentWasteTop) return prev
        if (!isAdjacentRank(slot.card.rank, currentWasteTop.rank, prev.wrapEnabled)) return prev
        const result = applyClear(prev, [slotId], slot.card, null)
        return commitState(prev, evaluateState(result.state))
      }

      if (activePowerup === 'wild') {
        if (prev.powerups.wild <= 0) return prev
        const result = applyClear(prev, [slotId], slot.card, 'wild')
        return commitState(prev, evaluateState(result.state))
      }

      if (activePowerup === 'bomb') {
        if (prev.powerups.bomb <= 0) return prev
        const neighbors = ADJACENCY[slotId].filter((id) => currentExposedSet.has(id))
        const cleared = Array.from(new Set([slotId, ...neighbors]))
        const result = applyClear(prev, cleared, slot.card, 'bomb')
        return commitState(prev, evaluateState(result.state))
      }

      if (activePowerup === 'rainbow') {
        if (prev.powerups.rainbow <= 0) return prev
        const rank = slot.card.rank
        const cleared = currentExposedIds.filter((id) => prev.tableau[id]?.card?.rank === rank)
        const result = applyClear(prev, cleared, slot.card, 'rainbow')
        return commitState(prev, evaluateState(result.state))
      }

      return prev
    })
  }

  function applyClear(
    prev: GameState,
    clearedIds: number[],
    wasteCard: Slot['card'],
    powerupSpent: Powerup | null,
  ): ClearResult {
    if (!wasteCard) return { state: prev, clearedCount: 0 }
    const clearedSet = new Set(clearedIds)
    const nextTableau = prev.tableau.map((slot) =>
      clearedSet.has(slot.id) ? { ...slot, card: null } : slot,
    )

    const clearedCount = clearedIds.length
    const nextCombo = prev.combo + clearedCount

    const scoreMultiplier = getComboMultiplier(nextCombo)
    const scoreGain = Math.round(clearedCount * BASE_POINTS * scoreMultiplier)

    const nextPowerups = { ...prev.powerups }
    if (powerupSpent) {
      nextPowerups[powerupSpent] = Math.max(0, nextPowerups[powerupSpent] - 1)
    }

    const { inventory, nextCycle } = grantPowerups(
      prev.combo,
      nextCombo,
      nextPowerups,
      prev.powerupCycle,
    )

    const nextState: GameState = {
      ...prev,
      tableau: nextTableau,
      waste: [...prev.waste, wasteCard],
      combo: nextCombo,
      score: prev.score + scoreGain,
      powerups: inventory,
      powerupCycle: nextCycle,
      activePowerup: null,
    }

    return { state: nextState, clearedCount }
  }

  return (
    <div className="app">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Candy Peaks</p>
          <h1>Tri-Peaks Solitaire Prototype</h1>
          <p className="subhead">Chain clears for powerups and sweet combos.</p>
        </div>
        <div className="controls">
          <label className="seed">
            Seed
            <input
              value={seedInput}
              onChange={(event) => {
                const next = event.target.value
                setSeedInput(next)
                setSeedLocked(next.trim().length > 0)
              }}
              placeholder="sweet-seed"
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={seedLocked}
              onChange={(event) => setSeedLocked(event.target.checked)}
            />
            <span>Lock seed</span>
          </label>
          <button className="btn primary" onClick={startNewGame}>
            Deal New Game
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setHistory([])
              setGame(createGameState(game.seed))
            }}
          >
            Replay Seed
          </button>
        </div>
      </header>

      <main className="main">
        <section className="board-wrap">
          <div className="status-row">
            <div className="stat">
              <span className="label">Score</span>
              <strong>{game.score}</strong>
              <span className="meta">Base {BASE_POINTS} / card</span>
            </div>
            <div className="stat">
              <span className="label">Combo</span>
              <strong>{game.combo}</strong>
              <span className="meta">x{comboMultiplier.toFixed(1)} multiplier</span>
              <div className="combo-meter">
                <div
                  className="combo-fill"
                  style={{ width: `${((game.combo % 3) / 3) * 100}%` }}
                />
              </div>
              <span className="meta">Every 3 clears grants a powerup</span>
            </div>
            <div className="stat actions">
              <span className="label">Actions</span>
              <button className="btn mini" onClick={undo} disabled={!canUndo}>
                Undo
              </button>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={game.wrapEnabled}
                  onChange={(event) => toggleWrap(event.target.checked)}
                />
                <span>K-A wrap</span>
              </label>
              <span className="meta">Ace and King count as adjacent</span>
            </div>
          </div>

          <div className="pile-row">
            <div className="pile">
              <span className="label">Stock ({game.stock.length})</span>
              <button
                type="button"
                className="mini-card back"
                onClick={drawFromStock}
                disabled={game.stock.length === 0 || game.status !== 'playing'}
              >
                <span className="mini-rank">{game.stock.length}</span>
                <span className="mini-suit">Draw</span>
              </button>
            </div>
            <div className="pile">
              <span className="label">Waste</span>
              <MiniCard card={wasteTop} label="Empty" />
            </div>
            <div className="pile">
              <span className="label">Hold</span>
              <MiniCard
                card={game.hold}
                label="Empty"
                onClick={useHold}
                disabled={!canHold}
              />
              <button className="btn mini" onClick={useHold} disabled={!canHold}>
                {game.hold ? 'Swap' : 'Hold'}
              </button>
            </div>
          </div>

          <div className="board" style={{ ['--board-cols' as string]: boardCols }}>
            {game.tableau.map((slot) => {
              if (!slot.card) return null
              const exposed = exposedSet.has(slot.id)
              const card = slot.card
              const playable = isCardPlayable(
                exposed,
                card,
                wasteTop,
                game.activePowerup,
                game.wrapEnabled,
              )
              const symbol = suitSymbol(card.suit)
              const isRed = isRedSuit(card.suit)
              const faceUp = exposed || showCovered
              const invalid = invalidCardId === slot.id
              const cardKey = `${slot.id}-${invalid ? invalidToken : 0}`
              return (
                <button
                  key={cardKey}
                  className={`card ${exposed ? 'exposed' : 'blocked'} ${
                    exposed && highlightPlayable ? (playable ? 'playable' : 'unplayable') : ''
                  } ${faceUp ? (isRed ? 'red' : 'black') : 'face-down'} ${
                    invalid ? 'invalid' : ''
                  }`}
                  style={{
                    left: `calc(${slot.x} * var(--slot-x))`,
                    top: `calc(${slot.row} * var(--slot-y))`,
                  }}
                  onClick={() => {
                    if (!playable) {
                      triggerInvalid(slot.id)
                      return
                    }
                    handleCardClick(slot.id)
                  }}
                  type="button"
                  disabled={!faceUp}
                  aria-disabled={!playable}
                  aria-label={faceUp ? `${rankLabel(card.rank)}${symbol}` : 'face down card'}
                >
                  {faceUp ? (
                    <>
                      <span className="card-corner top">
                        {rankLabel(card.rank)}
                        {symbol}
                      </span>
                      <span className="card-suit">{symbol}</span>
                      <span className="card-corner bottom">
                        {rankLabel(card.rank)}
                        {symbol}
                      </span>
                    </>
                  ) : (
                    <span className="card-back-pattern" />
                  )}
                </button>
              )
            })}
          </div>

          {game.status !== 'playing' && (
            <div className="overlay">
              <div className="overlay-card">
                <h2>{game.status === 'won' ? 'Sweet Victory!' : 'No Moves Left'}</h2>
                {game.status === 'won' && (
                  <p>Stock bonus: +{game.stock.length * STOCK_BONUS} points</p>
                )}
                <button className="btn primary" onClick={startNewGame}>
                  Deal Again
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="side-panel">
          <CollapsiblePanel title="Powerups" defaultOpen>
            <div className="panel-body">
              <p className="panel-text">
                Build combos without drawing to unlock candy powerups. Select a powerup, then click
                an exposed card to use it.
              </p>
              <div className="powerups">
                {renderPowerup(
                  'wild',
                  game.powerups.wild,
                  game.activePowerup,
                  togglePowerup,
                )}
                {renderPowerup(
                  'bomb',
                  game.powerups.bomb,
                  game.activePowerup,
                  togglePowerup,
                )}
                {renderPowerup(
                  'rainbow',
                  game.powerups.rainbow,
                  game.activePowerup,
                  togglePowerup,
                )}
              </div>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel title="How to Play" defaultOpen={!isNarrow}>
            <div className="panel-body">
              <ul>
                <li>
                  Click an exposed tableau card if it is one rank above or below the waste (K-A
                  wrap is optional).
                </li>
                <li>
                  Drawing from stock or using Hold resets your combo. Chain clears to increase your
                  multiplier.
                </li>
                <li>Hold stores the current waste card or swaps it back onto the waste stack.</li>
                <li>Undo rewinds moves, draws, hold swaps, powerup uses, and rule toggles.</li>
                <li>Every 3 consecutive clears earns the next powerup in the cycle:</li>
              </ul>
              <ol>
                <li>Wild: play any exposed card.</li>
                <li>Bomb: clear the selected card plus exposed neighbors.</li>
                <li>Rainbow: click a card to pick its rank and clear all exposed cards of that rank.</li>
              </ol>
              <p>Clear every tableau card to win. Unused stock adds a bonus.</p>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel title="Difficulty" defaultOpen={!isNarrow}>
            <div className="panel-body">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showCovered}
                  onChange={(e) => setShowCovered(e.target.checked)}
                />
                <span>Show covered cards</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={highlightPlayable}
                  onChange={(e) => setHighlightPlayable(e.target.checked)}
                />
                <span>Highlight playable cards</span>
              </label>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel title="Deal Details" defaultOpen={!isNarrow}>
            <div className="panel-body">
              <p className="panel-text">Seed: {game.seed}</p>
              <p className="panel-text">K-A wrap: {game.wrapEnabled ? 'On' : 'Off'}</p>
              <p className="panel-text">Powerup cycle: {POWERUP_ORDER.join(' -> ')}</p>
            </div>
          </CollapsiblePanel>
        </aside>
      </main>
    </div>
  )
}

function renderPowerup(
  powerup: Powerup,
  count: number,
  active: Powerup | null,
  toggle: (powerup: Powerup) => void,
) {
  const label = powerup[0].toUpperCase() + powerup.slice(1)
  return (
    <button
      type="button"
      className={`powerup ${active === powerup ? 'active' : ''}`}
      onClick={() => toggle(powerup)}
      disabled={count <= 0}
    >
      <span className="powerup-name">{label}</span>
      <span className="powerup-count">x{count}</span>
    </button>
  )
}

function MiniCard({
  card,
  label,
  onClick,
  disabled,
}: {
  card?: Card | null
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  const symbol = card ? suitSymbol(card.suit) : ''
  const isRed = card ? isRedSuit(card.suit) : false
  const className = `mini-card ${card ? (isRed ? 'red' : 'black') : 'empty'}`

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} disabled={disabled}>
        {card ? (
          <>
            <span className="mini-rank">{rankLabel(card.rank)}</span>
            <span className="mini-suit">{symbol}</span>
          </>
        ) : (
          <span className="mini-empty">{label}</span>
        )}
      </button>
    )
  }

  return (
    <div className={className}>
      {card ? (
        <>
          <span className="mini-rank">{rankLabel(card.rank)}</span>
          <span className="mini-suit">{symbol}</span>
        </>
      ) : (
        <span className="mini-empty">{label}</span>
      )}
    </div>
  )
}

function generateRandomSeed(): string {
  const maybeCrypto =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined

  if (maybeCrypto?.randomUUID) return maybeCrypto.randomUUID()

  if (maybeCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    maybeCrypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(query)
    const onChange = () => setMatches(mediaQuery.matches)

    onChange()
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [query])

  return matches
}

function CollapsiblePanel({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => Boolean(defaultOpen))
  return (
    <details
      className="panel"
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{title}</summary>
      {children}
    </details>
  )
}

function isCardPlayable(
  exposed: boolean,
  card: Card,
  wasteTop: Card | undefined,
  activePowerup: Powerup | null,
  wrapEnabled: boolean,
): boolean {
  if (!exposed) return false
  if (activePowerup) return true
  if (!wasteTop) return false
  return isAdjacentRank(card.rank, wasteTop.rank, wrapEnabled)
}

function suitSymbol(suit: Suit): string {
  if (suit === 'H') return '♥'
  if (suit === 'D') return '♦'
  if (suit === 'C') return '♣'
  return '♠'
}

function isRedSuit(suit: Suit): boolean {
  return suit === 'H' || suit === 'D'
}

function getComboMultiplier(combo: number): number {
  if (combo <= 0) return 1
  const steps = Math.floor(combo / 3)
  return 1 + Math.min(steps * 0.5, 2)
}

function grantPowerups(
  oldCombo: number,
  newCombo: number,
  inventory: Record<Powerup, number>,
  cycleIndex: number,
) {
  let nextCycle = cycleIndex
  const nextInventory = { ...inventory }
  for (let combo = oldCombo + 1; combo <= newCombo; combo += 1) {
    if (combo % 3 === 0) {
      const powerup = POWERUP_ORDER[nextCycle % POWERUP_ORDER.length]
      nextInventory[powerup] += 1
      nextCycle += 1
    }
  }
  return { inventory: nextInventory, nextCycle }
}

function evaluateState(state: GameState): GameState {
  if (state.status !== 'playing') return state

  const cleared = state.tableau.every((slot) => !slot.card)
  if (cleared) {
    if (!state.bonusAwarded) {
      return {
        ...state,
        score: state.score + state.stock.length * STOCK_BONUS,
        status: 'won',
        bonusAwarded: true,
      }
    }
    return { ...state, status: 'won' }
  }

  if (state.stock.length === 0) {
    const exposedIds = getExposedIds(state.tableau)
    if (exposedIds.length === 0) {
      return { ...state, status: 'lost' }
    }

    const wasteTop = state.waste[state.waste.length - 1]
    const hasPowerup =
      state.activePowerup !== null ||
      state.powerups.wild + state.powerups.bomb + state.powerups.rainbow > 0

    const canPlay = wasteTop
      ? exposedIds.some((id) => {
          const card = state.tableau[id]?.card
          return card ? isAdjacentRank(card.rank, wasteTop.rank, state.wrapEnabled) : false
        })
      : false

    if (!hasPowerup && !canPlay) {
      return { ...state, status: 'lost' }
    }
  }

  return state
}
