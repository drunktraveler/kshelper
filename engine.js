import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 1000, isBear = false, isOptimizing = false) {
    const isStochastic = (atkLuck === 'stochastic');
    const atkP = processBatches(setup.atk.batches);
    const defP = isBear ? {
        counts: { inf: 1000000, cav: 0, arc: 0 },
        avgBase: { inf: { atk: 472, def: 10, leth: 10, hp: 83.3333 }, cav: {atk:0,def:0,leth:0,hp:0}, arc: {atk:0,def:0,leth:0,hp:0} },
        weights: { inf: { t7: 1, tg3: 1, tg5: 1 }, cav: {t7:0,tg3:0,tg5:0}, arc: {t7:0,tg3:0,tg5:0} }
    } : processBatches(setup.def.batches);

    const atkH = getHeroData(setup.atk);
    const defH = isBear ? { passives:[], actives:[] } : getHeroData(setup.def);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1000000 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    let wave = 0, triggers = { atk: {}, def: {} }, activeBuffs = { atk: [], def: [] };

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        
        // 1. SNAPSHOTS: Damage for BOTH sides is calculated using counts at the start of the wave.
        const atkSnap = { ...m_cur }, defSnap = { ...e_cur };
        let pendingDamage = { atk: { inf:0, cav:0, arc:0 }, def: { inf:0, cav:0, arc:0 } };

        let waveMults = {
            atk: { inf:{off:1,surv:1,dodge:0}, cav:{off:1,surv:1,dodge:0}, arc:{off:1,surv:1,dodge:0} },
            def: { inf:{off:1,surv:1,dodge:0}, cav:{off:1,surv:1,dodge:0}, arc:{off:1,surv:1,dodge:0} }
        };

        ['atk', 'def'].forEach(side => {
            const h = (side === 'atk' ? atkH : defH);
            let b = {
                inf: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 },
                cav: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 },
                arc: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 }
            };

            const currentActiveSkills = [...h.passives];
            if (isStochastic) {
                activeBuffs[side] = activeBuffs[side].filter(b => b.expires > wave);
                h.actives.forEach(act => {
                    let procced = false;
                    if (act.minWave && act.interval) {
                        if (wave >= act.minWave && (wave - act.minWave) % act.interval < act.duration) procced = true;
                    } else if (Math.random() < (1 - Math.pow(1 - act.p, act.instances))) procced = true;

                    if (procced) {
                        triggers[side][act.name] = (triggers[side][act.name] || 0) + 1;
                        if (!act.interval) activeBuffs[side].push({ ...act, expires: wave + act.duration });
                        else applyToBucket(b, act, 1.0);
                    }
                });
                activeBuffs[side].forEach(ab => applyToBucket(b, ab, 1.0));
            } else {
                h.actives.forEach(act => {
                    let uptime = 0;
                    if (act.minWave && act.interval) {
                        uptime = (act.duration / act.interval) * (Math.max(0, nWaves - act.minWave + 1) / nWaves);
                    } else {
                        uptime = 1 - Math.pow(1 - act.p, isBear ? 1 : (act.duration || 1));
                        if (act.minWave) uptime *= (Math.max(0, nWaves - act.minWave + 1) / nWaves);
                    }
                    applyToBucket(b, act, uptime);
                });
            }
            currentActiveSkills.forEach(s => applyToBucket(b, s, 1.0));

            ['inf', 'cav', 'arc'].forEach(u => {
                waveMults[side][u].off = (1 + b[u][101]) * b[u][102] * b[u][103] * b[u][104] * b[u][105] * b[u][106];
                waveMults[side][u].surv = (1 + b[u][201]) * b[u][202] * b[u][203] * b[u][204] * b[u][205];
                waveMults[side][u].dodge = b[u][250];
            });
        });

        // Target Logic Snapshots
        const mf = (['inf', 'cav', 'arc'].find(u => atkSnap[u] >= 1) || 'arc');
        const ef = (['inf', 'cav', 'arc'].find(u => defSnap[u] >= 1) || 'arc');

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return;
            const sP = (side === 'atk' ? atkP : defP), tP = (side === 'atk' ? defP : atkP);
            const sSnap = (side === 'atk' ? atkSnap : defSnap), tSnap = (side === 'atk' ? defSnap : atkSnap);
            const sS = setup[side], tS = setup[target], tf = (side === 'atk' ? ef : mf);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sSnap[u] < 1) return;

                const roll = (p) => isStochastic ? (Math.random() < p ? 1 : 0) : p;

                const calcKills = (tUnit, scalar = 1.0) => {
                    let offMod = 1.0, defMod = 1.0;
                    
                    // 1. Rock Paper Scissors (Passive)
                    if (u === 'inf' && tUnit === 'cav') offMod *= 1.1;
                    if (u === 'cav' && tUnit === 'arc') offMod *= 1.1;
                    if (u === 'arc' && tUnit === 'inf') offMod *= 1.1;

                    // 2. Weighted Abilities
                    const w = sP.weights[u], tw = tP.weights[tUnit];
                    
                    // T7+ Thresholds
                    if (u === 'arc') offMod *= (1 + (roll(0.1) * 1.0 * w.t7)); // Volley
                    if (tUnit === 'inf' && u === 'cav') defMod *= (1 / (1 + (0.1 * tw.t7))); // Bands of Steel vs Cav
                    
                    // TG3+ & TG5+ Weighted Logic
                    if (u === 'arc') {
                        const chance = (0.3 * w.tg5) + (0.2 * (w.tg3 - w.tg5));
                        offMod *= (1 + (roll(chance) * 0.5)); // Howling Wind
                    }
                    if (u === 'cav') {
                        const chance = (0.15 * w.tg5) + (0.1 * (w.tg3 - w.tg5));
                        offMod *= (1 + (roll(chance) * 1.0)); // Assault Lance
                    }
                    if (tUnit === 'inf') {
                        const chance = (0.375 * tw.tg5) + (0.25 * (tw.tg3 - tw.tg5));
                        defMod *= (1 / (1 + (roll(chance) * 0.36))); // Unyielding Shield
                    }

                    const bStats = sP.avgBase[u], tStats = tP.avgBase[tUnit];
                    const finalMult = (waveMults[side][u].off * offMod) / (waveMults[target][tUnit].surv * defMod);
                    const dodgeRed = isStochastic ? 1.0 : (1 - waveMults[target][tUnit].dodge);

                    const kills = (Math.sqrt(sSnap[u]) * sq_min * (bStats.atk * (1 + sS.stats[u+'_att']/100)) * (bStats.leth * (1 + sS.stats[u+'_leth']/100)) * finalMult * dodgeRed) / 
                                  ((tStats.def * (1 + tS.stats[tUnit+'_def']/100)) * (tStats.hp * (1 + tS.stats[tUnit+'_hp']/100)) * 100);
                    
                    return kills * scalar;
                };

                // Bypass Ambusher Check
                if (u === 'cav' && sP.weights.cav.t7 > 0 && tSnap['arc'] >= 1 && tf !== 'arc' && !isBear) {
                    const bypassChance = 0.2 * sP.weights.cav.t7;
                    const isBypass = roll(bypassChance);
                    if (isBypass === 1 || (!isStochastic && isBypass > 0)) {
                        pendingDamage[target]['arc'] += calcKills('arc', isStochastic ? 1 : bypassChance);
                        if (!isStochastic) pendingDamage[target][tf] += calcKills(tf, 1 - bypassChance);
                    } else pendingDamage[target][tf] += calcKills(tf);
                } else pendingDamage[target][tf] += calcKills(tf);
            });
        });

        // 2. APPLY DAMAGE (Mirror match now ends in tie due to simultaneous update)
        ['inf', 'cav', 'arc'].forEach(u => {
            m_cur[u] = Math.max(0, m_cur[u] - pendingDamage.atk[u]);
            e_cur[u] = Math.max(0, e_cur[u] - pendingDamage.def[u]);
        });

        if (isBear) break;
    }

    return { m_cur, e_cur, wave, totalDmg: isBear ? (1000000 - e_cur.inf) : 0, 
             atk_logs: finalizeLogs('atk', triggers, atkH, atkP, defP, isStochastic),
             def_logs: finalizeLogs('def', triggers, defH, defP, atkP, isStochastic) };
}

function applyToBucket(buckets, skill, uptime) {
    const affectedUnits = skill.units || ["inf", "cav", "arc"];
    skill.ids.forEach((id, idx) => {
        const rawM = Array.isArray(skill.m) ? skill.m[idx] : skill.m;
        affectedUnits.forEach(u => {
            let mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
            let final = mag * skill.instances * uptime;
            if (id === 101 || id === 201) buckets[u][id] += final;
            else if (id === 250) buckets[u][id] += final;
            else buckets[u][id] *= (1 + final);
        });
    });
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

    let passives = [], actives = [];
    for (const name in lineup) {
        const h = lineup[name];
        h.data.skills.forEach((s, si) => {
            const instances = h.lead + (si === 0 ? h.joiner : 0);
            if (instances === 0) return;

            const lvl = h.levels[`s${si+1}`] || 5;
            const x = s.values[lvl - 1];
            const p = s.getChance(x);
            const m = s.getMagnitude(x);

            const skillObj = { 
                name: `${name} ${s.name}`, p, m, ids: s.ids, 
                duration: s.duration || 1, instances,
                units: s.units || null,
                minWave: s.minWave || 0,
                interval: s.interval || 0
            };

            if (p >= 1.0) passives.push(skillObj);
            else actives.push(skillObj);
        });
    }
    return { passives, actives };
}

function finalizeLogs(side, triggers, hData, pData, oppP, isStochastic) {
    let list = [];
    [...hData.passives, ...hData.actives].forEach(act => {
        const isP = act.p >= 1.0;
        let val = isP ? "Passive" : (isStochastic ? `Triggers: ${triggers[side][act.name] || 0}` : `Proc: ${(act.p * 100).toFixed(0)}%`);
        list.push({ name: act.name, val, isPassive: isP });
    });
    const iE = (pData.weights.inf.tg3 * 100).toFixed(0);
    const cE = (pData.weights.cav.tg3 * 100).toFixed(0);
    const aE = (pData.weights.arc.tg3 * 100).toFixed(0);
    return { skills: list, troopEff: `Inf ${iE}% | Cav ${cE}% | Arc ${aE}%` };
}
