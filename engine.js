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
        return Math.max(0, Math.min(1, mode === 'lucky' ? p + 1.96 * sigma : p - 1.96 * sigma));
    };

    let troopProcs = { atk: { ds:0, ln:0, sh:0, bp:0 }, def: { ds:0, ln:0, sh:0, bp:0 } };
    const m_skill = getMultipliers(setup.atk, atkP, 'num', atkLuck, shift, 'atk', isBear, isOptimizing);
    const e_skill = isBear ? { units: {all:1}, logs: [] } : getMultipliers(setup.def, defP, 'num', defLuck, shift, 'def', false, isOptimizing);

    let wave = 0;
    // PURE SIMULATION: Loop strictly until one side is dead
    while (isAlive(m_cur) && (isBear || isAlive(e_cur))) {
        wave++;
        const mf = (['infantry','cavalry','archers'].find(u => m_cur[u.slice(0,3)] >= 1) || 'archers').slice(0,3);
        const ef = (['infantry','cavalry','archers'].find(u => e_cur[u.slice(0,3)] >= 1) || 'archers').slice(0,3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return; 
            const sP = (side==='atk'?atkP:defP), tP = (side==='atk'?defP:atkP), sC = (side==='atk'?m_cur:e_cur), tC = (side==='atk'?e_cur:m_cur);
            const sS = setup[side], tS = setup[target], tf = (side==='atk'?ef:mf), sMod = (side==='atk'?m_skill:e_skill);
            const sL = (side==='atk'?atkLuck:defLuck);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] < 1) return;
                const b = sP.avgBase[u];

                const calcKills = (targetType, abilMod = 1.0) => {
                    const tb = tP.avgBase[targetType];
                    const atk = b.atk * (1 + sS.stats[u+'_att']/100);
                    const leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                    let df = tb.def * (1 + tS.stats[targetType+'_def']/100);
                    const hp = tb.hp * (1 + tS.stats[targetType+'_hp']/100);
                    if (targetType === 'inf' && u === 'cav' && tP.weights.inf.t7 > 0) df *= 1.1;
                    const interaction = (u==='inf'&&targetType==='cav') || (u==='cav'&&targetType==='arc') || (u==='arc'&&targetType==='inf') ? 1.1 : 1.0;
                    return (Math.sqrt(sC[u]) * sq_min * atk * leth * interaction * abilMod * sMod.units.all) / (df * hp * 100);
                };

                let abil = 1.0; const w = sP.weights[u];
                const getVal = (p, id) => {
                    if (isStochastic) {
                        const hit = Math.random() < p ? 1 : 0;
                        if (hit) troopProcs[side][id]++;
                        return hit;
                    }
                    return shift(p, sL); 
                };

                if (u==='arc') { 
                    if (w.t7 > 0) abil *= (1 + getVal(0.1, 'ds') * w.t7); 
                    const windP = w.tg5 ? 0.3 : (w.tg3 ? 0.2 : 0); 
                    if (windP > 0) abil *= (1 + getVal(windP, 'ds') * 0.5); 
                }
                if (u==='cav') { 
                    const lanceP = w.tg5 ? 0.15 : (w.tg3 ? 0.1 : 0); 
                    if (lanceP > 0) abil *= (1 + getVal(lanceP, 'ln')); 
                }
                if (tf==='inf') { 
                    const tw = tP.weights.inf; 
                    const shieldP = tw.tg5 ? 0.375 : (tw.tg3 ? 0.25 : 0); 
                    if (shieldP > 0) abil *= (1 - (getVal(shieldP, 'sh') * 0.36)); 
                }

               // BYPASS RULE (Option A: No damage is lost if target is already Archers)
if (u === 'cav' && w.t7 > 0 && tC['arc'] >= 1 && tf !== 'arc' && !isBear) {
    const bpProb = isStochastic ? 0.2 : shift(0.2, sL);
    if (isStochastic) {
        if (Math.random() < bpProb) {
            troopProcs[side].bp++;
            // Target the backline archers since tf is currently Infantry or Cavalry
            pending.push({dict: tC, unit: 'arc', amt: calcKills('arc', abil)});
            return; 
        }
    } else {
        // Deterministic: Split damage between frontline and backline archers
        pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil) * (1 - bpProb)});
        pending.push({dict: tC, unit: 'arc', amt: calcKills('arc', abil) * bpProb});
        return;
    }
}
                pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil)});
            });
        });
        // SIMULTANEOUS DAMAGE APPLICATION
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
        if (isBear) break;
    }

    const ceilRes = (cur) => ({ inf: Math.ceil(cur.inf), cav: Math.ceil(cur.cav), arc: Math.ceil(cur.arc) });
    
    // LOG TROOP STATUS
    const finalizeLogs = (side, skillLogs) => {
    const p = side === 'atk' ? atkP : defP;
    const combinedLogs = [...skillLogs];
    
    // Troop Interaction Consolidation
    let interactions = [];
    ['inf', 'cav', 'arc'].forEach(u => {
        const w = p.weights[u];
        if (w.t7 > 0) interactions.push(`${u.toUpperCase()} T7+ (${(w.t7 * 100).toFixed(0)}%)`);
        if (w.tg3 > 0 || w.tg5 > 0) {
            const highTg = Math.max(w.tg3, w.tg5);
            interactions.push(`${u.toUpperCase()} TG3+ (${(highTg * 100).toFixed(0)}%)`);
        }
    });

    if (interactions.length > 0) {
        combinedLogs.unshift(`<span class="text-slate-300">[Troop Abilities]</span> ${interactions.join(' | ')}`);
    }
    
    // Static Interactions (Rock-Paper-Scissors)
    combinedLogs.unshift(`<span class="text-slate-300">[Counters]</span> Standard 10% RPS active`);
    
    return combinedLogs;
};

const finalAtkLogs = finalizeLogs('atk', m_skill.logs);
const finalDefLogs = finalizeLogs('def', e_skill.logs);

return { 
    m_cur: ceilRes(m_cur), 
    e_cur: ceilRes(e_cur), 
    wave, 
    atk_mults: finalAtkLogs, 
    def_mults: finalDefLogs, 
    startAtk: totalStartAtk, 
    startDef: totalStartDef 
};
    
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

function getMultipliers(side, proc, type, luckMode, shiftFn, sideKey, isBear, isOptimizing) {
    let pools = {}, logs = [];
    const isStochastic = (luckMode === 'stochastic');

    side.heroes.forEach((h, index) => {
        if(h.name === "None") return;
        const d = HEROES[h.name];
        d.skills.forEach((s, si) => {
            // Logic: A side always procs its own 'num' (Buffs) 
            // and it procs 'den' (Debuffs) to be applied to the enemy.
            // The simulation handles the application.
            if (index >= 3 && si > 0) return;
            
            const x = s.values[h[`s${si+1}`]-1];
            const p = s.getChance(x), m = s.getMagnitude(x);
            let ev;
            
            if (p >= 1.0) ev = m;
            else if (isStochastic) ev = (Math.random() < p ? m : 0);
            else ev = (s.duration === 0 ? shiftFn(p, luckMode) : (1 - Math.pow(1 - shiftFn(p, luckMode), s.duration))) * m;

            s.ids.forEach((id, idx) => {
                const val = (Array.isArray(ev) ? ev[idx] : ev);
                pools[id] = (pools[id] || 0) + val;
            });
            
            if(!isOptimizing && ev !== 0) {
                const displayVal = (Array.isArray(ev) ? ev[0] : ev);
                logs.push(`<span class="text-slate-500">Slot ${index+1}</span> ${h.name}: ${s.name} <span class="text-blue-400">+${(displayVal * 100).toFixed(1)}%</span>`);
            }
        });
    });
    let mult = 1.0; 
    Object.values(pools).forEach(v => mult *= (1+v));
    return { units: {all:mult}, logs };
}
