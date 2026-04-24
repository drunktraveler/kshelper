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

    // Tracking for Stochastic Logs
    let triggers = { atk: {}, def: {} };
    let troopProcs = { atk: { wind:0, lance:0, shield:0, bypass:0 }, def: { wind:0, lance:0, shield:0, bypass:0 } };

    const m_data = getMultipliers(setup.atk, atkLuck, shift, isOptimizing, isBear, triggers.atk);
    const e_data = isBear ? { selfMult: 1, enemyMult: 1, logs: [] } : getMultipliers(setup.def, defLuck, shift, isOptimizing, false, triggers.def);

    let wave = 0;
    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        const mf = (['inf', 'cav', 'arc'].find(u => m_cur[u] >= 1) || 'arc');
        const ef = (['inf', 'cav', 'arc'].find(u => e_cur[u] >= 1) || 'arc');
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return; 
            const sP = (side==='atk' ? atkP : defP), tP = (side==='atk' ? defP : atkP);
            const sC = (side==='atk' ? m_cur : e_cur), tC = (side==='atk' ? e_cur : m_cur);
            const sS = setup[side], tS = setup[target], tf = (side==='atk' ? ef : mf);
            const sL = (side==='atk'?atkLuck:defLuck);
            
            const effectiveMult = (side === 'atk') ? (m_data.selfMult * e_data.enemyMult) : (e_data.selfMult * m_data.enemyMult);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] < 1) return;
                const b = sP.avgBase[u], w = sP.weights[u];

                const calcKills = (targetType, abilMod = 1.0) => {
                    const tb = tP.avgBase[targetType];
                    const atk = b.atk * (1 + sS.stats[u+'_att']/100), leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                    let df = tb.def * (1 + tS.stats[targetType+'_def']/100), hp = tb.hp * (1 + tS.stats[targetType+'_hp']/100);
                    const interaction = (u==='inf'&&targetType=='cav') || (u==='cav'&&targetType=='arc') || (u==='arc'&&targetType=='inf') ? 1.1 : 1.0;
                    return (Math.sqrt(sC[u]) * sq_min * atk * leth * interaction * abilMod * effectiveMult) / (df * hp * 100);
                };

                let abil = 1.0;
                const roll = (p, id) => {
                    if (isStochastic) {
                        const hit = Math.random() < p ? 1 : 0;
                        if (hit) troopProcs[side][id]++;
                        return hit;
                    }
                    return shift(p, sL);
                };

                if (u==='arc') {
                    const windP = w.tg5 ? 0.3 : (w.tg3 ? 0.2 : 0);
                    if (windP > 0) abil *= (1 + roll(windP, 'wind') * 0.5);
                    if (w.t7 > 0) abil *= (1 + roll(0.1, 'wind') * w.t7);
                }
                if (u==='cav') {
                    const lanceP = w.tg5 ? 0.15 : (w.tg3 ? 0.1 : 0);
                    if (lanceP > 0) abil *= (1 + roll(lanceP, 'lance'));
                }
                if (tf==='inf') {
                    const tw = tP.weights.inf;
                    const shieldP = tw.tg5 ? 0.375 : (tw.tg3 ? 0.25 : 0);
                    if (shieldP > 0) abil *= (1 - (roll(shieldP, 'shield') * 0.36));
                }

                if (u === 'cav' && w.t7 > 0 && tC['arc'] >= 1 && tf !== 'arc' && !isBear) {
                    const bp = roll(0.2, 'bypass');
                    if (isStochastic) {
                        if (bp) { pending.push({dict: tC, unit: 'arc', amt: calcKills('arc', abil)}); return; }
                    } else {
                        pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil) * (1 - bp)});
                        pending.push({dict: tC, unit: 'arc', amt: calcKills('arc', abil) * bp});
                        return;
                    }
                }
                pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil)});
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
        if (isBear) break;
    }

    const finalizeLogs = (side, skillLogs) => {
        const p = side === 'atk' ? atkP : defP;
        const tp = troopProcs[side];
        let interactions = [];
        ['inf', 'cav', 'arc'].forEach(u => {
            const w = p.weights[u];
            if (w.t7 > 0) interactions.push(`${u.toUpperCase()} T7+ (${(w.t7 * 100).toFixed(0)}%)`);
            if (w.tg3 > 0 || w.tg5 > 0) interactions.push(`${u.toUpperCase()} TG3/5 (${(Math.max(w.tg3,w.tg5)*100).toFixed(0)}%)`);
        });
        
        const troopLog = interactions.length > 0 ? `<div class="text-slate-300 mb-1 font-bold">[Troop Efficiency] ${interactions.join(' | ')}</div>` : '';
        const procLog = isStochastic ? `<div class="text-amber-500/80 text-[9px] mt-1 border-t border-slate-800/50 pt-1">Triggers: Wind(${tp.wind}) Lance(${tp.lance}) Shield(${tp.shield}) Bypass(${tp.bypass})</div>` : '';
        
        return [
            `<div class="text-slate-500 font-bold mb-1">[Passive] Standard 10% RPS Counters Active</div>`,
            troopLog,
            ...skillLogs,
            procLog
        ];
    };

    return { 
        m_cur, e_cur, wave, 
        atk_mults: finalizeLogs('atk', m_data.logs), 
        def_mults: finalizeLogs('def', e_data.logs), 
        totalDmg: isBear ? (1000000 - e_cur.inf) : 0 
    };
}

function processBatches(batches) {
    let totals = {inf:0,cav:0,arc:0}, avgBase = {inf:{atk:0,def:0,leth:0,hp:0},cav:{atk:0,def:0,leth:0,hp:0},arc:{atk:0,def:0,leth:0,hp:0}};
    let weights = {inf:{t7:0,tg3:0,tg5:0},cav:{t7:0,tg3:0,tg5:0},arc:{t7:0,tg3:0,tg5:0}};
    batches.forEach(b => {
        ['inf','cav','arc'].forEach(u => {
            const longU = u==='arc'?'archers':(u==='inf'?'infantry':'cavalry');
            // Use unit-specific tiers gathered in ui-bridge
            const tier = b[u+'_tier'], tg = b[u+'_tg'], count = b[u];
            if (!count) return;
            const stats = UNITS[longU][tier][tg];
            totals[u] += count;
            avgBase[u].atk += stats[0] * count; avgBase[u].def += stats[1] * count; avgBase[u].leth += stats[2] * count; avgBase[u].hp += stats[3] * count;
            if (tier >= 7) weights[u].t7 += count;
            if (tg >= 3) weights[u].tg3 += count;
            if (tg >= 5) weights[u].tg5 += count;
        });
    });
    ['inf', 'cav', 'arc'].forEach(u => { if (totals[u] > 0) { Object.keys(avgBase[u]).forEach(k => avgBase[u][k] /= totals[u]); Object.keys(weights[u]).forEach(k => weights[u][k] /= totals[u]); } });
    return { counts: totals, avgBase, weights };
}

function getMultipliers(sideSetup, luckMode, shiftFn, isOptimizing, isBear, triggerTracker) {
    let selfPool = {}, enemyPool = {}, logs = [];
    const isStochastic = (luckMode === 'stochastic');

    sideSetup.heroes.forEach((h, index) => {
        if(h.name === "None") return;
        const d = HEROES[h.name];
        d.skills.forEach((s, si) => {
            if (index >= 3 && si > 0) return;
            const x = s.values[h[`s${si+1}`]-1], p = s.getChance(x), m = s.getMagnitude(x);
            
            let ev;
            if (p >= 1.0) {
                ev = m;
            } else if (isStochastic) {
                const hits = Math.random() < p ? 1 : 0;
                if (!triggerTracker[h.name]) triggerTracker[h.name] = {};
                triggerTracker[h.name][s.name] = (triggerTracker[h.name][s.name] || 0) + hits;
                ev = hits * m;
            } else {
                ev = (s.duration === 0 ? shiftFn(p, luckMode) : (1 - Math.pow(1 - shiftFn(p, luckMode), s.duration))) * m;
            }

            s.ids.forEach((id, idx) => {
                if (isBear && id >= 200) return;
                const val = (Array.isArray(ev) ? ev[idx] : ev);
                if (id < 200) selfPool[id] = (selfPool[id] || 0) + val;
                else enemyPool[id] = (enemyPool[id] || 0) + val;
            });

            if(!isOptimizing) {
                const isPassive = p >= 1.0;
                const label = isStochastic && !isPassive ? `Triggers: ${triggerTracker[h.name][s.name]}` : `Eff: +${((Array.isArray(ev)?ev[0]:ev)*100).toFixed(1)}%`;
                logs.push(`<div class="flex justify-between border-b border-slate-900/40 py-0.5"><span>${h.name} ${s.name}</span> <span class="${isPassive?'text-blue-400':'text-amber-500'} font-bold">${label}</span></div>`);
            }
        });
    });
    const calc = (pool) => { let m = 1.0; Object.values(pool).forEach(v => m *= (1 + v)); return m; };
    return { selfMult: calc(selfPool), enemyMult: calc(enemyPool), logs };
}
