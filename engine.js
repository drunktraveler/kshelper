import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 1000, isBear = false, isOptimizing = false) {
    const isStochastic = (atkLuck === 'stochastic');
    const atkP = processBatches(setup.atk.batches);
    const defP = isBear ? {
        counts: { inf: 1000000, cav: 0, arc: 0 },
        avgBase: { inf: { atk: 0, def: 10, leth: 10, hp: 83.3333 }, cav: { atk: 0, def: 0, leth: 0, hp: 0 }, arc: { atk: 0, def: 0, leth: 0, hp: 0 } },
        weights: { inf: { t7: 1, tg3: 0, tg5: 0 }, cav: {t7:0,tg3:0,tg5:0}, arc: {t7:0,tg3:0,tg5:0} }
    } : processBatches(setup.def.batches);

    const atkH = getHeroData(setup.atk);
    const defH = isBear ? { passives:{self:{},enemy:{}}, actives:[] } : getHeroData(setup.def);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1000000 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    // Widget Multipliers (Solo Defense/Rally context logic)
    const getWidgetMults = (side, ctx) => {
        let sums = { attack: 0, defense: 0, lethality: 0, health: 0 };
        setup[side].heroes.slice(0, 3).forEach(h => {
            if (h.name === "None") return;
            const d = HEROES[h.name];
            if (d.widget && d.widget.context === ctx) sums[d.widget.stat] += WIDGET_GROWTH[h.widgetLv || 10];
        });
        return { 
            atkLeth: (1 + sums.attack) * (1 + sums.lethality),
            defHp: (1 + sums.defense) * (1 + sums.health)
        };
    };

    // Widgets: Sim uses screen values usually, but we verify context here
    // If Attacker is in sim, we assume 'off' context. If Defender, 'def' context.
    const w_atk = getWidgetMults('atk', 'off');
    const w_def = getWidgetMults('def', 'def');

    let wave = 0, triggers = { atk: {}, def: {} };
    let activeBuffs = { atk: [], def: [] }; // { ids, mag, expires }

    // PRE-CALCULATE DETERMINISTIC MULTIPLIERS
    // If not stochastic, we calculate EV once and apply statically.
    let detMults = { atk: { self: 1, enemy: 1 }, def: { self: 1, enemy: 1 } };
    if (!isStochastic) {
        ['atk', 'def'].forEach(side => {
            const h = (side === 'atk' ? atkH : defH);
            const luck = (side === 'atk' ? atkLuck : defLuck);
            let sPool = { ...h.passives.self }, ePool = { ...h.passives.enemy };

            h.actives.forEach(act => {
                const combinedP = 1 - Math.pow(1 - act.p, act.instances);
                const shift = (p, mode) => (mode === 'average' || p <= 0 || p >= 1) ? p : (mode === 'lucky' ? Math.min(1, p + 0.1) : Math.max(0, p - 0.1));
                const uptime = (1 - Math.pow(1 - shift(combinedP, luck), isBear ? 1 : act.duration));
                
                act.ids.forEach((id, idx) => {
                    if (isBear && id >= 200) return;
                    const val = (Array.isArray(act.m) ? act.m[idx] : act.m) * uptime;
                    const p = id < 200 ? sPool : ePool;
                    p[id] = (p[id] || 0) + val;
                });
            });
            const calc = (p) => { let m = 1.0; Object.values(p).forEach(v => m *= (1 + v)); return m; };
            detMults[side] = { self: calc(sPool), enemy: calc(ePool) };
        });
    }

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        let m_wave_mults = { self: detMults.atk.self, enemy: detMults.atk.enemy };
        let e_wave_mults = { self: detMults.def.self, enemy: detMults.def.enemy };

        if (isStochastic) {
            ['atk', 'def'].forEach(side => {
                const h = (side === 'atk' ? atkH : defH);
                activeBuffs[side] = activeBuffs[side].filter(b => b.expires > wave);
                
                h.actives.forEach(act => {
                    const combinedP = 1 - Math.pow(1 - act.p, act.instances);
                    if (Math.random() < combinedP) {
                        triggers[side][act.name] = (triggers[side][act.name] || 0) + 1;
                        activeBuffs[side].push({ ids: act.ids, mag: act.m, expires: wave + (isBear ? 1 : act.duration) });
                    }
                });

                let sPool = { ...h.passives.self }, ePool = { ...h.passives.enemy };
                activeBuffs[side].forEach(b => {
                    b.ids.forEach((id, idx) => {
                        if (isBear && id >= 200) return;
                        const val = Array.isArray(b.mag) ? b.mag[idx] : b.mag;
                        const p = id < 200 ? sPool : ePool;
                        p[id] = (p[id] || 0) + val;
                    });
                });
                const calc = (p) => { let m = 1.0; Object.values(p).forEach(v => m *= (1 + v)); return m; };
                if (side === 'atk') m_wave_mults = { self: calc(sPool), enemy: calc(ePool) };
                else e_wave_mults = { self: calc(sPool), enemy: calc(ePool) };
            });
        }

        const mf = (['inf', 'cav', 'arc'].find(u => m_cur[u] >= 1) || 'arc');
        const ef = (['inf', 'cav', 'arc'].find(u => e_cur[u] >= 1) || 'arc');
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return; 
            const sP = (side==='atk' ? atkP : defP), tP = (side==='atk' ? defP : atkP);
            const sC = (side==='atk' ? m_cur : e_cur), tC = (side==='atk' ? e_cur : m_cur);
            const sS = setup[side], tS = setup[target], tf = (side==='atk' ? ef : mf);
            const sL = (side==='atk'?atkLuck:defLuck);
            
            const selfM = (side === 'atk' ? m_wave_mults.self : e_wave_mults.self);
            const oppE = (side === 'atk' ? e_wave_mults.enemy : m_wave_mults.enemy);
            const widgetM = (side === 'atk' ? w_atk.atkLeth : w_def.atkLeth);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] < 1) return;
                const b = sP.avgBase[u], w = sP.weights[u];
                const calcKills = (targetType, abilMod = 1.0) => {
                    const tb = tP.avgBase[targetType];
                    const atk = b.atk * (1 + sS.stats[u+'_att']/100);
                    const leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                    let df = tb.def * (1 + tS.stats[targetType+'_def']/100);
                    const hp = tb.hp * (1 + tS.stats[targetType+'_hp']/100);
                    const interaction = (u==='inf'&&targetType=='cav') || (u==='cav'&&targetType=='arc') || (u==='arc'&&targetType=='inf') ? 1.1 : 1.0;
                    // Precision formula: (Base * Multipliers * Widgets)
                    return (Math.sqrt(sC[u]) * sq_min * atk * leth * interaction * abilMod * selfM * oppE * widgetM) / (df * hp * 100);
                };

                let abil = 1.0;
                const roll = (p) => isStochastic ? (Math.random() < p ? 1 : 0) : p;
                if (u==='arc') {
                    if (w.tg3 || w.tg5) abil *= (1 + roll(w.tg5?0.3:0.2) * 0.5);
                    if (w.t7 > 0) abil *= (1 + roll(0.1) * w.t7);
                }
                if (u==='cav') { if (w.tg3 || w.tg5) abil *= (1 + roll(w.tg5?0.15:0.1)); }
                if (tf==='inf') { 
                    const tw = tP.weights.inf;
                    if (tw.tg3 || tw.tg5) abil *= (1 - (roll(tw.tg5?0.375:0.25) * 0.36));
                }

                if (u === 'cav' && w.t7 > 0 && tC['arc'] >= 1 && tf !== 'arc' && !isBear) {
                    const bp = roll(0.2);
                    pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil) * (1 - bp)});
                    pending.push({dict: tC, unit: 'arc', amt: calcKills('arc', abil) * bp});
                } else {
                    pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil)});
                }
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
        if (isBear) break;
    }

    const finalizeLogs = (side, h) => {
        let l = [];
        const p = side==='atk'?atkP:defP;
        let t7 = []; ['inf','cav','arc'].forEach(u => { if(p.weights[u].t7>0) t7.push(`${u.toUpperCase()}(${(p.weights[u].t7*100).toFixed(0)}%)`)});
        // Active Skills
        h.actives.forEach(act => {
            const val = isStochastic ? `Triggers: ${triggers[side][act.name] || 0}` : `Eff: +${(act.m * (1-Math.pow(1-(act.p), act.duration))*100).toFixed(1)}%`;
            l.push({ name: act.name, val, isPassive: false });
        });
        // Passives
        for (let id in h.passives.self) l.push({ name: `ID ${id} Passive`, val: `+${(h.passives.self[id]*100).toFixed(1)}%`, isPassive: true });
        return { skills: l, troopEff: t7.join(' | '), triggers: triggers[side] };
    };

    return { 
        m_cur: {inf: Math.ceil(m_cur.inf), cav: Math.ceil(m_cur.cav), arc: Math.ceil(m_cur.arc)}, 
        e_cur: {inf: Math.ceil(e_cur.inf), cav: Math.ceil(e_cur.cav), arc: Math.ceil(e_cur.arc)}, 
        wave, atk_logs: finalizeLogs('atk', atkH), def_logs: finalizeLogs('def', defH), totalDmg: isBear ? (1000000 - e_cur.inf) : 0 
    };
}

function processBatches(batches) {
    let totals = {inf:0,cav:0,arc:0}, avgBase = {inf:{atk:0,def:0,leth:0,hp:0},cav:{atk:0,def:0,leth:0,hp:0},arc:{atk:0,def:0,leth:0,hp:0}};
    let weights = {inf:{t7:0,tg3:0,tg5:0},cav:{t7:0,tg3:0,tg5:0},arc:{t7:0,tg3:0,tg5:0}};
    
    batches.forEach(b => {
        ['inf','cav','arc'].forEach(u => {
            const longU = u==='arc'?'archers':(u==='inf'?'infantry':'cavalry');
            const tier = b[u+'_tier'], tg = b[u+'_tg'], count = b[u];
            if (!count) return;
            const stats = UNITS[longU][tier][tg];
            totals[u] += count;
            avgBase[u].atk += stats[0] * count; 
            avgBase[u].def += stats[1] * count; 
            avgBase[u].leth += stats[2] * count; 
            avgBase[u].hp += stats[3] * count;
            if (tier >= 7) weights[u].t7 += count;
            if (tg >= 3) weights[u].tg3 += count;
            if (tg >= 5) weights[u].tg5 += count;
        });
    });
    ['inf', 'cav', 'arc'].forEach(u => { 
        if (totals[u] > 0) { 
            Object.keys(avgBase[u]).forEach(k => avgBase[u][k] /= totals[u]); 
            Object.keys(weights[u]).forEach(k => weights[u][k] /= totals[u]); 
        } 
    });
    return { counts: totals, avgBase, weights };
}

function getMultipliers(sideSetup, luckMode, shiftFn, isOptimizing, isBear, triggerTracker) {
    let selfPool = {}, enemyPool = {}, logs = [];
    const isStochastic = (luckMode === 'stochastic');

    // 1. Group lineup to apply stacking rules correctly
    const lineup = {}; 
    sideSetup.heroes.forEach((h, index) => {
        if (h.name === "None" || !HEROES[h.name]) return;
        if (!lineup[h.name]) {
            lineup[h.name] = { 
                lead: 0, 
                joiner: 0, 
                data: HEROES[h.name], 
                levels: { s1: h.s1, s2: h.s2, s3: h.s3 } 
            };
        }
        if (index < 3) lineup[h.name].lead++; 
        else lineup[h.name].joiner++;
    });

    for (const name in lineup) {
        const h = lineup[name];
        h.data.skills.forEach((s, si) => {
            // Logic: Leaders get all skills, Joiners get S1 only
            const instances = h.lead + (si === 0 ? h.joiner : 0);
            if (instances === 0) return;

            // FIXED: Corrected property access (removed .roster)
            const lvl = h.levels[`s${si+1}`] || 5;
            const x = s.values[lvl - 1];
            if (x === undefined) return;

            const p = s.getChance(x);
            const m = s.getMagnitude(x);
            
            let factor;
            if (p >= 1.0) {
                factor = instances;
            } else {
                const combinedProb = 1 - Math.pow(1 - p, instances);
                if (isStochastic) {
                    const hit = Math.random() < combinedProb ? 1 : 0;
                    if (hit) triggerTracker[`${name} ${s.name}`] = (triggerTracker[`${name} ${s.name}`] || 0) + 1;
                    factor = hit;
                } else {
                    const dur = isBear ? 1 : (s.duration || 1);
                    factor = (1 - Math.pow(1 - shiftFn(combinedProb, luckMode), dur));
                }
            }

            // Calculation for math pool (handles multi-part arrays)
            const effectiveMagnitude = Array.isArray(m) ? m.map(v => v * factor) : m * factor;

            s.ids.forEach((id, idx) => {
                if (isBear && id >= 200) return;
                const val = Array.isArray(effectiveMagnitude) ? effectiveMagnitude[idx] : effectiveMagnitude;
                if (val === 0) return;

                if (id < 200) selfPool[id] = (selfPool[id] || 0) + val;
                else enemyPool[id] = (enemyPool[id] || 0) + val;
            });

            // 2. LOGGING (Handles multi-part visibility)
            if (!isOptimizing) {
                const isPassive = p >= 1.0;
                let logVal;
                
                if (isStochastic && !isPassive) {
                    logVal = `Triggers: ${triggerTracker[`${name} ${s.name}`] || 0}`;
                } else {
                    // FIXED: Now maps all parts of Saul/Hilde skills into the log string
                    if (Array.isArray(effectiveMagnitude)) {
                        logVal = "+" + effectiveMagnitude.map(v => (v * 100).toFixed(1) + "%").join("/");
                    } else {
                        logVal = `+${(effectiveMagnitude * 100).toFixed(1)}%`;
                    }
                }
                
                logs.push({ 
                    name: `${name} ${s.name}${instances > 1 ? ' (x' + instances + ')' : ''}`, 
                    val: logVal, 
                    isPassive 
                });
            }
        });
    }

    const calc = (pool) => { 
        let m = 1.0; 
        Object.values(pool).forEach(v => { if(!isNaN(v)) m *= (1 + v); }); 
        return m; 
    };
    return { selfMult: calc(selfPool), enemyMult: calc(enemyPool), logs };
}

function getHeroData(sideSetup) {
    const lineup = {}; 
    sideSetup.heroes.forEach((h, index) => {
        if (h.name === "None" || !HEROES[h.name]) return;
        if (!lineup[h.name]) {
            lineup[h.name] = { lead: 0, joiner: 0, data: HEROES[h.name], levels: { s1: h.s1, s2: h.s2, s3: h.s3 } };
        }
        if (index < 3) lineup[h.name].lead++; else lineup[h.name].joiner++;
    });

    let passives = { self: {}, enemy: {} }, actives = [];
    for (const name in lineup) {
        const h = lineup[name];
        h.data.skills.forEach((s, si) => {
            const instances = h.lead + (si === 0 ? h.joiner : 0);
            if (instances === 0) return;
            const lvl = h.levels[`s${si+1}`] || 5;
            const x = s.values[lvl - 1];
            const p = s.getChance(x), m = s.getMagnitude(x);

            if (p >= 1.0) {
                // PASSIVE: Magnitude * instances (Additive)
                s.ids.forEach((id, idx) => {
                    const val = (Array.isArray(m) ? m[idx] : m) * instances;
                    const pool = id < 200 ? passives.self : passives.enemy;
                    pool[id] = (pool[id] || 0) + val;
                });
            } else {
                // ACTIVE: Stored for the wave loop
                actives.push({ name: `${name} ${s.name}`, p, m, ids: s.ids, duration: s.duration || 1, instances });
            }
        });
    }
    return { passives, actives };
}
