export type Suit = 'H' | 'D' | 'C' | 'S'

export type Card = {
  id: string
  rank: number
  suit: Suit
}

export type Slot = {
  id: number
  row: number
  x: number
  card: Card | null
}

export type Powerup = 'wild' | 'bomb' | 'rainbow'
export type Inventory = Record<Powerup, number>
export type GameStatus = 'playing' | 'won' | 'lost'

export type GameState = {
  seed: string
  tableau: Slot[]
  stock: Card[]
  waste: Card[]
  hold: Card | null
  score: number
  combo: number
  powerups: Inventory
  activePowerup: Powerup | null
  powerupCycle: number
  wrapEnabled: boolean
  status: GameStatus
  bonusAwarded: boolean
}

const ROWS: Array<{ row: number; xs: number[] }> = [
  { row: 0, xs: [4, 10, 16] },
  { row: 1, xs: [3, 5, 9, 11, 15, 17] },
  { row: 2, xs: [2, 4, 6, 8, 10, 12, 14, 16, 18] },
  { row: 3, xs: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19] },
]

export const POWERUP_ORDER: Powerup[] = ['wild', 'bomb', 'rainbow']
export const BASE_POINTS = 100
export const STOCK_BONUS = 200

export const LAYOUT: Slot[] = buildLayout()
export const PARENTS = buildParents(LAYOUT)
export const ADJACENCY = buildAdjacency(LAYOUT, PARENTS)

export function createGameState(seed: string): GameState {
  const deck = createDeck()
  const rng = createRng(seed)
  shuffle(deck, rng)

  const tableau: Slot[] = LAYOUT.map((pos, index) => ({
    ...pos,
    card: deck[index] ?? null,
  }))

  const stock = deck.slice(tableau.length)
  const waste: Card[] = []
  if (stock.length > 0) {
    waste.push(stock.pop() as Card)
  }

  return {
    seed,
    tableau,
    stock,
    waste,
    hold: null,
    score: 0,
    combo: 0,
    powerups: { wild: 0, bomb: 0, rainbow: 0 },
    activePowerup: null,
    powerupCycle: 0,
    wrapEnabled: true,
    status: 'playing',
    bonusAwarded: false,
  }
}

export function isAdjacentRank(a: number, b: number, wrapEnabled = true): boolean {
  if (Math.abs(a - b) === 1) return true
  if (!wrapEnabled) return false
  return (a === 1 && b === 13) || (a === 13 && b === 1)
}

export function isExposed(slot: Slot, tableau: Slot[]): boolean {
  if (!slot.card) return false
  const parents = PARENTS[slot.id]
  for (const parentId of parents) {
    if (tableau[parentId]?.card) return false
  }
  return true
}

export function getExposedIds(tableau: Slot[]): number[] {
  const exposed: number[] = []
  for (const slot of tableau) {
    if (isExposed(slot, tableau)) exposed.push(slot.id)
  }
  return exposed
}

export function rankLabel(rank: number): string {
  if (rank === 1) return 'A'
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  if (rank === 13) return 'K'
  return String(rank)
}

function buildLayout(): Slot[] {
  let id = 0
  const slots: Slot[] = []
  for (const row of ROWS) {
    for (const x of row.xs) {
      slots.push({ id, row: row.row, x, card: null })
      id += 1
    }
  }
  return slots
}

function buildParents(layout: Slot[]): Record<number, number[]> {
  const lookup = new Map<string, number>()
  for (const slot of layout) {
    lookup.set(`${slot.row}:${slot.x}`, slot.id)
  }

  const parents: Record<number, number[]> = {}
  for (const slot of layout) {
    parents[slot.id] = []
  }

  for (const slot of layout) {
    const childRow = slot.row + 1
    const leftId = lookup.get(`${childRow}:${slot.x - 1}`)
    const rightId = lookup.get(`${childRow}:${slot.x + 1}`)
    if (leftId !== undefined) parents[leftId].push(slot.id)
    if (rightId !== undefined) parents[rightId].push(slot.id)
  }

  return parents
}

function buildAdjacency(
  layout: Slot[],
  parents: Record<number, number[]>,
): Record<number, number[]> {
  const lookup = new Map<string, number>()
  for (const slot of layout) {
    lookup.set(`${slot.row}:${slot.x}`, slot.id)
  }

  const adjacency: Record<number, number[]> = {}
  for (const slot of layout) {
    const neighbors = new Set<number>()
    for (const parentId of parents[slot.id]) neighbors.add(parentId)
    const childRow = slot.row + 1
    const leftId = lookup.get(`${childRow}:${slot.x - 1}`)
    const rightId = lookup.get(`${childRow}:${slot.x + 1}`)
    if (leftId !== undefined) neighbors.add(leftId)
    if (rightId !== undefined) neighbors.add(rightId)
    adjacency[slot.id] = Array.from(neighbors)
  }

  return adjacency
}

function createDeck(): Card[] {
  const suits: Suit[] = ['H', 'D', 'C', 'S']
  const deck: Card[] = []
  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ id: `${suit}${rank}`, rank, suit })
    }
  }
  return deck
}

function createRng(seed: string): () => number {
  const seedFn = xmur3(seed)
  const state = seedFn()
  return mulberry32(state)
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(deck: Card[], rng: () => number): void {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = deck[i]
    deck[i] = deck[j]
    deck[j] = tmp
  }
}
