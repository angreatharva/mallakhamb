// Token validation and management utilities
import { jwtDecode } from 'jwt-decode';

export const isTokenExpired = (token) => {
  if (!token) return true;
  
  try {
    const decoded = jwtDecode(token);
    if (!decoded.exp) return true;
    
    // Check if token expires in next 30 seconds (buffer time)
    const expiryTime = decoded.exp * 1000;
    const currentTime = Date.now();
    const bufferTime = 30 * 1000; // 30 seconds
    
    return currentTime >= (expiryTime - bufferTime);
  } catch {
    return true;
  }
};

export const getTokenData = (token) => {
  if (!token || isTokenExpired(token)) return null;
  
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};

export const getCompetitionIdFromToken = (token) => {
  const data = getTokenData(token);
  return data?.competitionId || null;
};
