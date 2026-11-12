import { createContext, useContext } from 'react';
import type { Me } from '../shared/types';

type TgMe = Extract<Me, { kind: 'tg' }>;

export const MeContext = createContext<TgMe | null>(null);
export const useMe = () => useContext(MeContext)!;
