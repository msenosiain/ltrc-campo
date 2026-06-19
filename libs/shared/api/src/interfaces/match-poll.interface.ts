export interface PollSquadPlayer {
  playerId: string;
  playerName: string;
  shirtNumber: number;
  posterLabel?: string;
}

export interface PollPlayerResult {
  playerId: string;
  playerName: string;
  shirtNumber: number;
  votes: number;
  percentage: number;
}

export interface MatchPoll {
  id: string;
  matchId: string;
  token: string;
  slug: string;
  votingPath: string;
  startsAt: Date;
  endsAt: Date;
  totalVotes: number;
  isActive: boolean;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchPollPublicInfo {
  token: string;
  matchTitle: string;
  isActive: boolean;
  isClosed: boolean;
  startsAt: Date;
  endsAt: Date;
  squad: PollSquadPlayer[];
}

export interface PollResults {
  totalVotes: number;
  top3: PollPlayerResult[];
  isActive: boolean;
  isClosed: boolean;
}