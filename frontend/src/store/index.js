import { createStore, combineReducers } from "redux";
import liveReducer from "./live/liveReducer";

const rootReducer = combineReducers({
  live: liveReducer,
});

const store = createStore(rootReducer);
export default store;
