const API_URL = import.meta.env.VITE_FEEDBACK_API_URL || 'http://localhost:5000/api';

export interface FeedbackInput {
  rating: number;
  comment: string;
  walletAddress?: string;
}

export interface FeedbackSubmission {
  id: number;
  rating: number;
  comment: string;
  wallet_address: string | null;
  timestamp: string;
}

export interface FeedbackStats {
  totalSubmissions: number;
  averageRating: number;
  submissions: FeedbackSubmission[];
}

export const submitFeedback = async (data: FeedbackInput): Promise<void> => {
  const response = await fetch(`${API_URL}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to submit feedback');
  }
};

export const getFeedbackStats = async (): Promise<FeedbackStats> => {
  const response = await fetch(`${API_URL}/feedback`);
  if (!response.ok) {
    throw new Error('Failed to retrieve feedback history');
  }
  return response.json();
};
