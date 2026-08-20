import React from 'react';
import type { MoveKind } from '../types';

interface Props { kind: MoveKind; active?: boolean; }
export const MovementAnimation: React.FC<Props> = ({ kind, active = true }) => <div className={`move-stage move-${kind} ${active ? 'is-moving' : ''}`} aria-label="Dimostrazione animata del movimento"><div className="ground" /><div className="figure"><span className="head" /><span className="body" /><span className="arm arm-a" /><span className="arm arm-b" /><span className="leg leg-a" /><span className="leg leg-b" /></div>{(kind === 'lateral' || kind === 'feet') && <><span className="marker marker-a" /><span className="marker marker-b" /></>}{(kind === 'sprint' || kind === 'bounds' || kind === 'broad') && <span className="motion-lines">›››</span>}</div>;
