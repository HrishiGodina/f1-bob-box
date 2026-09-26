export type TeamStyle = { color: string; short: string };

export const TEAM_COLORS: Record<string, TeamStyle> = {
  mercedes:     { color: '#00D2BE', short: 'MER' },
  red_bull:     { color: '#3671C6', short: 'RBR' },
  ferrari:      { color: '#E8002D', short: 'FER' },
  mclaren:      { color: '#FF8000', short: 'MCL' },
  aston_martin: { color: '#229971', short: 'AMF' },
  alpine:       { color: '#0093CC', short: 'ALP' },
  williams:     { color: '#64C4FF', short: 'WIL' },
  haas:         { color: '#B6BABD', short: 'HAA' },
  rb:           { color: '#6692FF', short: 'RB' },
  sauber:       { color: '#52E252', short: 'SAU' },
  kick_sauber:  { color: '#52E252', short: 'SAU' },
};
