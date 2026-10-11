import { CHARACTERS } from '../art/characters.ts'
import { MAX_PLAYERS, type LobbyPlayer, type LobbySettings, type Team } from '../net/protocol.ts'

export const TEAM_NAMES = ['GOLD', 'TEAL'] as const
export interface MatchPlayer {
  slot: number
  name: string
  char: number
  color: number
  team: Team
  ai: boolean
}
export function playerLimit(settings: LobbySettings): number {
  return settings.gameMode === 'teams' ? 4 : MAX_PLAYERS
}
export function nextTeam(players: { team: Team }[]): Team {
  return players.filter(p => p.team === 0).length <= players.filter(p => p.team === 1).length ? 0 : 1
}
/** One roster calculation for the lobby preview, START validation and every match client. */
export function buildRoster(humans: LobbyPlayer[], settings: LobbySettings): MatchPlayer[] {
  const teams = settings.gameMode === 'teams'
  const roster: MatchPlayer[] = humans.map(p => ({ ...p, color: teams ? p.team : p.color, ai: false }))
  const count = Math.min(settings.bots, Math.max(0, playerLimit(settings) - roster.length))
  for (let i = 0; i < count; i++) {
    let slot = 0
    while (roster.some(p => p.slot === slot)) slot++
    const team = nextTeam(roster)
    roster.push({ slot, name: `BOT ${i + 1}`, char: slot % CHARACTERS.length, color: teams ? team : slot, team, ai: true })
  }
  return roster.sort((a, b) => a.slot - b.slot)
}
export function readyToStart(humans: LobbyPlayer[], settings: LobbySettings): boolean {
  const roster = buildRoster(humans, settings)
  if (settings.gameMode === 'teams') return roster.length === 4 && roster.filter(p => p.team === 0).length === 2
  return roster.length >= 2 && roster.length <= MAX_PLAYERS
}
