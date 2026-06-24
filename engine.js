import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 1000, isBear = false) {
    const isStochastic = (atkLuck === 'stochastic');
    const atkP = processBatches(setup.atk.batches);
    const defP = isBear ? {
        counts: { inf: 1000000, cav: 0, arc: 0 },
        avgBase: { inf: { atk: 0, def: 10, leth: 10, hp: 83.3333 }, cav: {atk:0,def:0,leth:0,hp:0}, arc: {atk:0,def:0,leth:0,hp:0} },
        weights: { inf: { t7: 0, tg3: 0, tg5: 0 }, cav: {t7:0,tg3:0,tg5:0}, arc: {t7:0,tg3:0,tg5:0} }
    } : processBatches(setup.def.batches);

    const atkH = getHeroData(setup.atk);
    const defH = isBear ? { passives:[], actives:[] } : getHeroData(setup.def);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    let wave = 0;
    let triggers = { atk: {}, def: {} };

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        
        let buckets = {
            atk: { inf: createBuckets(), cav: createBuckets(), arc: createBuckets() },
            def: { inf: createBuckets(), cav: createBuckets(), arc: createBuckets() }
        };

        // Apply Hero Skills to Buckets
        ['atk', 'def'].forEach(side => {
            const h = (side === 'atk' ? atkH : defH);
            h.passives.forEach(p => applyToBucket(buckets[side], p, 1.0));
            h.actives.forEach(act => {
                let uptime = isStochastic ? (Math.random() < (1 - Math.pow(1 - act.p, act.instances)) ? 1 : 0) : act.p;
                if (uptime > 0) {
                    applyToBucket(buckets[side], act, uptime);
                    if (isStochastic && uptime === 1) triggers[side][act.name] = (triggers[side][act.name] || 0) + 1;
                }
            });
        });

        let losses = { atk: {inf:0,cav:0,arc:0}, def: {inf:0,cav:0,arc:0} };

        const runSide = (side, opp, self_cur, opp_cur, selfP, oppP) => {
            const sideTrig = triggers[side];
            const oppTrig = triggers[opp];

            ['inf', 'cav', 'arc'].forEach(u => {
                if (self_cur[u] <= 1) return;

                // --- 1. TARGET SELECTION & BYPASS (Ambusher) ---
                let target = opp_cur.inf > 1 ? 'inf' : (opp_cur.cav > 1 ? 'cav' : 'arc');
                let ambusherActive = false;

                if (u === 'cav' && selfP.weights.cav.t7 > 0.5 && opp_cur.arc > 1) {
                    const chance = 0.20;
                    if (isStochastic) {
                        if (Math.random() < chance) {
                            target = 'arc';
                            ambusherActive = true;
                            sideTrig['Cavalry Ambusher'] = (sideTrig['Cavalry Ambusher'] || 0) + 1;
                        }
                    } else {
                        // Deterministic handles bypass by splitting damage (calculated later)
                        ambusherActive = true; 
                    }
                }

                // --- 2. OFFENSIVE ABILITIES ---
                let offMult = 1.0;
                
                // RPS Systems
                if (u === 'inf' && target === 'cav') offMult *= 1.10; // Master Brawler
                if (u === 'cav' && target === 'arc') offMult *= 1.10; // Charge
                if (u === 'arc' && target === 'inf') offMult *= 1.10; // Ranged Strike

                // Archer Procs
                if (u === 'arc') {
                    // Volley (T7)
                    if (selfP.weights.arc.t7 > 0.5) {
                        if (isStochastic) {
                            if (Math.random() < 0.10) { offMult *= 2.0; sideTrig['Archer Volley'] = (sideTrig['Archer Volley'] || 0) + 1; }
                        } else { offMult *= 1.10; }
                    }
                    // Howling Wind (TG3/5)
                    const hwChance = selfP.weights.arc.tg5 > 0.5 ? 0.30 : (selfP.weights.arc.tg3 > 0.5 ? 0.20 : 0);
                    if (hwChance > 0) {
                        if (isStochastic) {
                            if (Math.random() < hwChance) { offMult *= 1.5; sideTrig['Archer Howling Wind'] = (sideTrig['Archer Howling Wind'] || 0) + 1; }
                        } else { offMult *= (1 + (hwChance * 0.5)); }
                    }
                }

                // Cavalry Procs
                if (u === 'cav') {
                    // Assault Lance (TG3/5)
                    const alChance = selfP.weights.cav.tg5 > 0.5 ? 0.15 : (selfP.weights.cav.tg3 > 0.5 ? 0.10 : 0);
                    if (alChance > 0) {
                        if (isStochastic) {
                            if (Math.random() < alChance) { offMult *= 2.0; sideTrig['Cavalry Assault Lance'] = (sideTrig['Cavalry Assault Lance'] || 0) + 1; }
                        } else { offMult *= (1 + (alChance * 1.0)); }
                    }
                }

                // --- 3. DEFENSIVE ABILITIES ---
                let defMult = 1.0;
                
                // Infantry Bands of Steel (T7)
                if (target === 'inf' && u === 'cav' && oppP.weights.inf.t7 > 0.5) {
                    defMult *= 1.10; 
                }

                // Infantry Unyielding Shield (TG3/5)
                if (target === 'inf') {
                    const usChance = oppP.weights.inf.tg5 > 0.5 ? 0.375 : (oppP.weights.inf.tg3 > 0.5 ? 0.25 : 0);
                    if (usChance > 0) {
                        if (isStochastic) {
                            if (Math.random() < usChance) { 
                                defMult *= (1 / 0.64); // Reduces incoming dmg by 36%
                                oppTrig['Infantry Unyielding Shield'] = (oppTrig['Infantry Unyielding Shield'] || 0) + 1;
                            }
                        } else {
                            defMult *= (1 / (1 - (usChance * 0.36)));
                        }
                    }
                }

                // --- 4. DAMAGE CALCULATION ---
                const b = buckets[side][u];
                const ob = buckets[opp][target];
                
                let totalAtk = selfP.avgBase[u].atk * (1 + (setup[side].stats[`${u}_att`]/100) + b[101]);
                // Multi-ID multiplication
                [102, 103, 104, 105, 106].forEach(id => { totalAtk *= (1 + b[id]); });
                totalAtk *= offMult;

                const totalLeth = selfP.avgBase[u].leth * (1 + (setup[side].stats[`${u}_leth`]/100));
                
                const totalHP = oppP.avgBase[target].hp * (1 + (setup[opp].stats[`${target}_hp`]/100) + ob[201]);
                const totalDef = oppP.avgBase[target].def * (1 + (setup[opp].stats[`${target}_def`]/100)); // Standard def
                
                // Effective Health = HP * Def_Layer * Passive_Abilities
                let effectiveHP = totalHP * (1 + ob[202]) * (1 + ob[203]) * defMult;

                let dmg = (Math.sqrt(self_cur[u]) * totalAtk * totalLeth) / (effectiveHP * 833.333);
                
                // Deterministic Ambusher split logic
                if (!isStochastic && ambusherActive && u === 'cav') {
                    losses[opp]['arc'] += dmg * 0.20;
                    losses[opp][target] += dmg * 0.80;
                } else {
                    losses[opp][target] += dmg;
                }
            });
        };

        runSide('atk', 'def', m_cur, e_cur, atkP, defP);
        if (!isBear) runSide('def', 'atk', e_cur, m_cur, defP, atkP);

        // Apply losses
        ['inf', 'cav', 'arc'].forEach(u => {
            m_cur[u] = Math.max(0, m_cur[u] - losses.atk[u]);
            e_cur[u] = Math.max(0, e_cur[u] - losses.def[u]);
        });
    }

    return { 
        m_cur, e_cur, wave, 
        atk_logs: finalizeLogs('atk', triggers, atkH, atkP, defP, isStochastic), 
        def_logs: finalizeLogs('def', triggers, defH, defP, atkP, isStochastic) 
    };
}

function createBuckets() {
    return { 101:0, 102:0, 103:0, 104:0, 105:0, 106:0, 201:0, 202:0, 203:0, 204:0, 205:0, 250:0 };
}

function applyToBucket(buckets, skill, uptime) {
    const affectedUnits = skill.units || ["inf", "cav", "arc"];
    skill.ids.forEach((id, idx) => {
        const rawM = Array.isArray(skill.m) ? skill.m[idx] : skill.m;
        affectedUnits.forEach(u => {
            let mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
            let final = mag * (skill.instances || 1) * uptime;
            if (id === 101 || id === 201) buckets[u][id] += final;
            else if (id === 250) buckets[u][id] = Math.max(buckets[u][id], final); // Dodge is usually max-value
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
            if (x === undefined) return;
            const p = s.getChance(x);
            const m = s.getMagnitude(x);

            const skillObj = { 
                name: `${name} S${si+1}`, p, m, ids: s.ids, 
                duration: s.duration || 1, instances,
                units: s.units || null,
                minWave: s.minWave || 0,
                interval: s.interval || 0
            };
            if (p >= 1.0) passives.push(skillObj); else actives.push(skillObj);
        });
    }
    return { passives, actives };
}

function finalizeLogs(side, triggers, hData, pData, oppP, isStochastic) {
    let list = [];
    
    // 1. Hero Skills
    [...hData.passives, ...hData.actives].forEach(act => {
        const isP = act.p >= 1.0;
        let val = isP ? "Passive" : (isStochastic ? `Triggers: ${triggers[side][act.name] || 0}` : `Avg Proc: ${(act.p * 100).toFixed(0)}%`);
        list.push({ name: act.name, val, isPassive: isP });
    });

    // 2. Troop Abilities
    const troopAbilities = [
        { name: "Cavalry Ambusher", cond: pData.weights.cav.t7 > 0.5 },
        { name: "Archer Volley", cond: pData.weights.arc.t7 > 0.5 },
        { name: "Infantry Bands of Steel", cond: pData.weights.inf.t7 > 0.5 },
        { name: "Infantry Unyielding Shield", cond: pData.weights.inf.tg3 > 0.5 },
        { name: "Cavalry Assault Lance", cond: pData.weights.cav.tg3 > 0.5 },
        { name: "Archer Howling Wind", cond: pData.weights.arc.tg3 > 0.5 }
    ];

    troopAbilities.forEach(abil => {
        if (abil.cond) {
            let val = isStochastic ? `Triggers: ${triggers[side][abil.name] || 0}` : "Active";
            list.push({ name: abil.name, val, isPassive: !isStochastic });
        }
    });

    return { 
        skills: list, 
        troopEff: `Inf ${ (pData.weights.inf.tg3*100).toFixed(0) }% | Cav ${ (pData.weights.cav.tg3*100).toFixed(0) }% | Arc ${ (pData.weights.arc.tg3*100).toFixed(0) }%` 
    };
}
