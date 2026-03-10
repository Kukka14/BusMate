export const SET_RESULTS = "live/SET_RESULTS";
export const SET_CONNECTED = "live/SET_CONNECTED";
export const CLEAR_RESULTS = "live/CLEAR_RESULTS";

const initialState = {
  connected: false,
  results: null,
};

export default function liveReducer(state = initialState, action) {
  switch (action.type) {
    case SET_RESULTS:
      return { ...state, results: action.payload };
    case SET_CONNECTED:
      return { ...state, connected: action.payload };
    case CLEAR_RESULTS:
      return { ...state, results: null };
    default:
      return state;
  }
}
