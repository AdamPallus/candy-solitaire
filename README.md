# Candy Solitaire Prototype

A Vite + React + TypeScript prototype of Tri-Peaks solitaire with combo-driven candy powerups.

## Setup

```bash
npm install
npm run dev
```

## Controls

- Click an exposed tableau card that is one rank above or below the waste card.
- Click **Draw** to flip a card from stock to waste (this resets your combo).
- Use **Hold** to store the current waste card or swap it back (also resets your combo).
- Toggle K-A wrap to allow Ace/King adjacency.
- **Undo** rewinds moves, draws, hold actions, powerup uses, and rule toggles.
- Select a powerup button, then click an exposed card to use it.
- Deals randomize by default; enter a **Seed** (or toggle **Lock seed**) to replay/share a deterministic deal.

## Powerups

Powerups are earned every 3 consecutive clears without drawing from stock.

- Wild: play any exposed card.
- Bomb: clear the selected card plus its exposed neighbors.
- Rainbow: select a rank and clear all exposed cards of that rank.

## Scoring

- Base points per cleared card with a combo multiplier.
- Win bonus: leftover stock cards award extra points.

## Notes

- The layout uses a 3-peak tableau (3/6/9/10 rows).
- The same seed always produces the same deal (rule toggles do not change the shuffle).
