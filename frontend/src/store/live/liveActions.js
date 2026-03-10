import { SET_RESULTS, SET_CONNECTED, CLEAR_RESULTS } from "./liveReducer";

export const setResults = (data) => ({ type: SET_RESULTS, payload: data });
export const setConnected = (status) => ({ type: SET_CONNECTED, payload: status });
export const clearResults = () => ({ type: CLEAR_RESULTS });
