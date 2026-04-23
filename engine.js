import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 100, isBear = false, isOptimizing = false) {
    const isStochastic = (atkLuck === 'stochastic');
    const atkP = processBatches(setup.atk.batches);
    const defP = isBear ? {
        counts: { inf: 1000000, cav: 0, arc: 0 },
        avgBase: { inf: { atk: 0, def: 10, leth: 10, hp: 83.3333 }, cav: { atk: 0, def: 0, leth: 0, hp: 0 }, arc: { atk: 0, def: 0, leth: 0, hp: 0 } },
        weights: { inf: { t7: 1, tg3: 0, tg5: 0 }, cav: {t7:0,tg3:0,tg5:0}, arc: {t7:0,tg3:0,tg5:0} }
    } : processBatches(setup.def.batches);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1000000 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    const shift = (p, mode) => {
        if (mode === 'average' || p <= 0 || p >= 1) return p;
        const sigma = Math.sqrt((p * (1 - p)) / 12); 
        const res = mode === 'lucky' ? p + 1.96 * sigma : p - 1.96 * sigma;
        return Math.max(0, Math.min(1, res));
    };

    let troopProcs = { atk: { ds:0, ln:0, sh:0 }, def: { ds:0, ln:0, sh:0 } };
    
    const m_skill = getMultipliers(setup.atk, atkP, 'num', atkLuck, shift, 'atk', isBear);
    const e_skill = isBear ? { units: {all:1}, logs: [] } : getMultipliers(setup.def, defP, 'den', defLuck, shift, 'def', false);

    let wave = 0, totalDmg = 0;
    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < 2000) {
        wave++;
        const mf = (['infantry','cavalry','archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers').slice(0,3);
        const ef = (['infantry','cavalry','archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers').slice(0,3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return; 
            const sP = (side==='atk'?atkP:defP), tP = (side==='atk'?defP:atkP), sC = (side==='atk'?m_cur:e_cur), tC = (side==='atk'?e_cur:m_cur);
            const sS = setup[side], tS = setup[target], tf = (side==='atk'?ef:mf), sMod = (side==='atk'?m_skill:e_skill);
            const sL = (side==='atk'?atkLuck:defLuck);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] <= 0) return;
                const b = sP.avgBase[u], tb = tP.avgBase[tf];
                let atk = b.atk * (1 + sS.stats[u+'_att']/100), leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                let df = tb.def * (1 + tS.stats[tf+'_def']/100), hp = tb.hp * (1 + tS.stats[tf+'_hp']/100);

                let interaction = (u==='inf'&&tf==='cav') || (u==='cav'&&tf==='arc') || (u==='arc'&&tf==='inf') ? 1.1 : 1.0;
                
                let abil = 1.0; const w = sP.weights[u];
                const getAbilVal = (p, id) => {
                    if (isStochastic) {
                        const hit = Math.random() < p ? 1 : 0;
                        if (hit) troopProcs[side][id]++;
                        return hit;
                    }
                    return shift(p, sL); 
                };

                if (u==='arc') { 
                    if (w.t7 > 0) abil *= (1 + getAbilVal(0.1, 'ds') * w.t7); 
                    const windP = w.tg5 ? 0.3 : (w.tg3 ? 0.2 : 0); 
                    if (windP > 0) abil *= (1 + getAbilVal(windP, 'ds') * 0.5); 
                }
                if (u==='cav') { 
                    const lanceP = w.tg5 ? 0.15 : (w.tg3 ? 0.1 : 0); 
                    if (lanceP > 0) abil *= (1 + getAbilVal(lanceP, 'ln') * 1.0); 
                }
                if (tf==='inf') { 
                    const tw = tP.weights.inf; 
                    if (u==='cav' && tw.t7 > 0) df *= (1 + (0.1 * tw.t7)); 
                    const shieldP = tw.tg5 ? 0.375 : (tw.tg3 ? 0.25 : 0); 
                    if (shieldP > 0) abil *= (1 - (getAbilVal(shieldP, 'sh') * 0.36)); 
                }

                let kills;
                if (isBear) {
                    kills = sq_min * Math.sqrt(sC[u]) * (atk/100) * (leth/100) * interaction * abil * 1.25;
                    totalDmg += kills;
                } else {
                    kills = (Math.sqrt(sC[u])*sq_min*atk*leth*interaction*abil*sMod.units.all)/(df*hp*100);
                }
                pending.push({dict: tC, unit: tf, amt: kills});
            });
        });
        if (!isBear) pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
        if (isBear) break; 
    }

    // --- REINTEGRATED TROOP LOGGING ---
    [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
        const sideP = (side === 'atk' ? atkP : defP);
        const logArr = (side === 'atk' ? m_skill.logs : e_skill.logs);
        const procs = troopProcs[side];

        ['inf','cav','arc'].forEach(u => {
            if (sideP.weights[u].t7 > 0) logArr.unshift(`[Troop] ${u.toUpperCase()} Tier 7+ active`);
            if (sideP.weights[u].tg3 > 0) logArr.unshift(`[Troop] ${u.toUpperCase()} TG3/5 active`);
        });

        if (isStochastic) {
            if (procs.ds > 0) logArr.push(`[Proc] Archer Multi-Hit: ${procs.ds} hits`);
            if (procs.ln > 0) logArr.push(`[Proc] Cavalry Lances: ${procs.ln} hits`);
            if (procs.sh > 0) logArr.push(`[Proc] Infantry Shields: ${procs.sh} hits`);
        }
    });

    const ceilRes = (cur) => ({ inf: Math.ceil(cur.inf), cav: Math.ceil(cur.cav), arc: Math.ceil(cur.arc) });

    return { 
        m_cur: ceilRes(m_cur), 
        e_cur: ceilRes(e_cur), 
        wave, 
        totalDmg: totalDmg * 10, 
        atk_mults: m_skill.logs, 
        def_mults: e_skill.logs, 
        startAtk: totalStartAtk, 
        startDef: totalStartDef 
    };
}

function processBatches(batches) {
    let totals = {inf:0,cav:0,arc:0}, avgBase = {inf:{atk:0,def:0,leth:0,hp:0},cav:{atk:0,def:0,leth:0,hp:0},arc:{atk:0,def:0,leth:0,hp:0}};
    let weights = {inf:{t7:0,tg3:0,tg5:0},cav:{t7:0,tg3:0,tg5:0},arc:{t7:0,tg3:0,tg5:0}};
    batches.forEach(b => {
        ['inf','cav','arc'].forEach(u => {
            const longU = u==='arc'?'archers':(u==='inf'?'infantry':'cavalry'), stats = UNITS[longU][b.tier][b.tg];
            totals[u] += b[u]; avgBase[u].atk += stats[0]*b[u]; avgBase[u].def += stats[1]*b[u]; avgBase[u].leth += stats[2]*b[u]; avgBase[u].hp += stats[3]*b[u];
            if (b.tier >= 7) weights[u].t7 += b[u]; if (b.tg >= 3) weights[u].tg3 += b[u]; if (b.tg >= 5) weights[u].tg5 += b[u];
        });
    });
    ['inf', 'cav', 'arc'].forEach(u => { if (totals[u]>0) { Object.keys(avgBase[u]).forEach(k => avgBase[u][k] /= totals[u]); Object.keys(weights[u]).forEach(k => weights[u][k] /= totals[u]); } });
    return { counts: totals, avgBase, weights };
}

function getMultipliers(side, proc, type, luckMode, shiftFn, sideKey, isBear) {
    let pools = {}, logs = [];
    const isStochastic = (luckMode === 'stochastic');

    side.heroes.forEach((h, index) => {
        if(h.name === "None") return;
        const d = HEROES[h.name];
        d.skills.forEach((s, si) => {
            if (s.group !== type && s.group !== 'den') return;
            if (index >= 3 && si > 0) return;

            const x = s.values[h[`s${si+1}`]-1];
            const p = s.getChance(x), m = s.getMagnitude(x), dur = isBear ? 0 : s.duration;
            
            let ev, triggered = false;
            if (p >= 1.0) {
                ev = m;
            } else if (isStochastic) {
                if (Math.random() < p) { ev = m; triggered = true; } else { ev = 0; }
            } else {
                const prob = shiftFn(p, luckMode);
                ev = (dur === 0 ? prob : (1 - Math.pow(1 - prob, dur))) * m;
            }

            s.ids.forEach((id, idx) => pools[id] = (pools[id] || 0) + (Array.isArray(ev) ? ev[idx] : ev));
            
            if (!isOptimizing) {
                const status = isStochastic ? (triggered ? "Triggered" : "Failed") : `+${(ev*100).toFixed(1)}% EV`;
                logs.push(`Slot ${index+1} ${h.name}: ${s.name} (${status})`);
            }
        });
    });

    let mult = 1.0; Object.values(pools).forEach(v => mult *= (1+v));
    return { units: {all:mult}, logs };
}
