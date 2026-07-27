export interface InternalPollAward {
  id: string;
  name: string;
}

export interface InternalPollVoter {
  userId: string;
  name: string;
  weight: 1 | 2; // 1 = jugador, 2 = cuerpo técnico
}

export interface InternalPoll {
  id: string;
  matchId: string;
  awards: InternalPollAward[];
  startsAt: Date;
  endsAt: Date;
  voters: InternalPollVoter[];
  totalVoters: number;
  totalVoted: number;
  isActive: boolean;
  isClosed: boolean;
  votingUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InternalPollSquadPlayer {
  playerId: string;
  playerName: string;
  shirtNumber: number;
}

export interface InternalPollMyVote {
  awardId: string;
  playerId: string;
}

export interface InternalPollInfo {
  matchId: string;
  awards: InternalPollAward[];
  squad: InternalPollSquadPlayer[];
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  isClosed: boolean;
  isEligible: boolean;
  hasVoted: boolean;
  myVotes: InternalPollMyVote[];
}

export interface InternalPollAwardResult {
  awardId: string;
  awardName: string;
  top: {
    playerId: string;
    playerName: string;
    shirtNumber: number;
    points: number;
    percentage: number;
  }[];
  totalPoints: number;
}

export interface InternalPollResults {
  isActive: boolean;
  isClosed: boolean;
  totalVoted: number;
  totalVoters: number;
  awards: InternalPollAwardResult[];
}
