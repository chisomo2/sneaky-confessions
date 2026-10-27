import { createContext, useContext } from "react";

export const DiscussionContext = createContext<(id: string) => void>(() => {});
export const useDiscussion = () => useContext(DiscussionContext);
