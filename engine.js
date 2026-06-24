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

    // DETERMINING SQRT(ARMY_MIN) - Constant based on Wave 0
    const totalStartAtk = Object.values(atkP.counts).reduce((a, b) => a + b, 0);
    const totalStartDef = Object.values(defP.counts).reduce((a, b) => a + b, 0);
    const army_min_sqrt = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    let wave = 0, triggers = { atk: {}, def: {} };

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        
        let buckets = {
            atk: { inf: createBuckets(), cav: createBuckets(), arc: createBuckets() },
            def: { inf: createBuckets(), cav: createBuckets(), arc: createBuckets() }
        };

        // 1. Hero Multipliers
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

        // 2. Simultaneous Damage Phase
        let losses = { atk: {inf:0,cav:0,arc:0}, def: {inf:0,cav:0,arc:0} };

        const runSide = (side, opp, self_cur, opp_cur, selfP, oppP) => {
            const sT = triggers[side];
            const oT = triggers[opp];

            ['inf', 'cav', 'arc'].forEach(u => {
                const count = self_cur[u];
                if (count <= 1) return;

                // --- A. TARGETING & BYPASS (Ambusher) ---
                let target = opp_cur.inf > 1 ? 'inf' : (opp_cur.cav > 1 ? 'cav' : 'arc');
                if (opp_cur[target] <= 0) return; 

                let bypassActive = false;
                if (u === 'cav' && selfP.weights.cav.t7 > 0 && opp_cur.arc > 1 && target !== 'arc') {
                    const bypassRate = 0.20 * selfP.weights.cav.t7;
                    if (isStochastic) {
                        if (Math.random() < bypassRate) { 
                            target = 'arc'; bypassActive = true; sT['Ambusher'] = (sT['Ambusher']||0)+1; 
                        }
                    } else { bypassActive = true; }
                }

                // --- B. OFFENSIVE ABILITIES ---
                let offMod = 1.0;
                if (u === 'arc') {
                    const vRate = 0.10 * selfP.weights.arc.t7; // Volley
                    if (isStochastic) { if(Math.random() < vRate) { offMod *= 2.0; sT['Volley'] = (sT['Volley']||0)+1; } }
                    else { offMod *= (1 + vRate); }

                    const hwRate = (selfP.weights.arc.tg5 > 0 ? 0.30 : (selfP.weights.arc.tg3 > 0 ? 0.20 : 0)) * (selfP.weights.arc.tg5 || selfP.weights.arc.tg3);
                    if (isStochastic) { if(Math.random() < hwRate) { offMod *= 1.5; sT['Howling Wind'] = (sT['Howling Wind']||0)+1; } }
                    else { offMod *= (1 + (hwRate * 0.5)); }
                }
                if (u === 'cav') {
                    const alRate = (selfP.weights.cav.tg5 > 0 ? 0.15 : (selfP.weights.cav.tg3 > 0 ? 0.10 : 0)) * (selfP.weights.cav.tg5 || selfP.weights.cav.tg3);
                    if (isStochastic) { if(Math.random() < alRate) { offMod *= 2.0; sT['Assault Lance'] = (sT['Assault Lance']||0)+1; } }
                    else { offMod *= (1 + alRate); }
                }

                // --- C. RPS & DEFENSE ---
                let rps = 1.0;
                if (u === 'inf' && target === 'cav') rps = 1.10; // Master Brawler
                if (u === 'cav' && target === 'arc') rps = 1.10; // Charge
                if (u === 'arc' && target === 'inf') rps = 1.10; // Ranged Strike

                let defMod = 1.0;
                if (target === 'inf' && u === 'cav' && oppP.weights.inf.t7 > 0) defMod *= 1.10; // Bands of Steel
                if (target === 'inf') {
                    const usRate = (oppP.weights.inf.tg5 > 0 ? 0.375 : (oppP.weights.inf.tg3 > 0 ? 0.25 : 0)) * (oppP.weights.inf.tg5 || oppP.weights.inf.tg3);
                    if (isStochastic) { if(Math.random() < usRate) { defMod *= (1 / 0.64); oT['Unyielding Shield'] = (oT['Unyielding Shield']||0)+1; } }
                    else { defMod *= (1 / (1 - (usRate * 0.36))); }
                }

                // --- D. CALCULATION ---
                const b = buckets[side][u];
                const ob = buckets[opp][target];
                const statsS = setup[side].stats;
                const statsO = setup[opp].stats;

                const totalOff = selfP.avgBase[u].atk * (statsS[`${u}_att`]/100) * (1+b[101]) * (1+b[102]) * (1+b[103]) * (1+b[104]) * (1+b[105]) * (1+b[106]) * offMod;
                const totalLeth = (statsS[`${u}_leth`]/100) * selfP.avgBase[u].leth;
                
                const heroDefMult = (1+ob[201]) * (1+ob[202]) * (1+ob[203]) * (1+ob[204]) * (1+ob[205]);
                const effHP = heroDefMult * (statsO[`${target}_def`]/100) * oppP.avgBase[target].def * (statsO[`${target}_hp`]/100) * oppP.avgBase[target].hp * defMod;

                let finalDmg = (Math.sqrt(count) * army_min_sqrt * totalOff * totalLeth) / (effHP || 1) * rps * 100;

                // Clamping/Overkill and Simultaneous application
                if (!isStochastic && bypassActive && u === 'cav' && opp_cur.arc > 1) {
                    losses[opp]['arc'] += Math.min(opp_cur.arc - losses[opp]['arc'], finalDmg * 0.20);
                    losses[opp][target] += Math.min(opp_cur[target] - losses[opp][target], finalDmg * 0.80);
                } else {
                    losses[opp][target] += Math.min(opp_cur[target] - losses[opp][target], finalDmg);
                }
            });
        };

        runSide('atk', 'def', m_cur, e_cur, atkP, defP);
        if (!isBear) runSide('def', 'atk', e_cur, m_cur, defP, atkP);

        // Apply buffered damage
        ['inf', 'cav', 'arc'].forEach(u => {
            m_cur[u] = Math.max(0, m_cur[u] - losses.atk[u]);
            e_cur[u] = Math.max(0, e_cur[u] - losses.def[u]);
        });
    }

    return { m_cur, e_cur, wave, 
        atk_logs: finalizeLogs('atk', triggers, atkH, atkP, defP, isStochastic), 
        def_logs: finalizeLogs('def', triggers, defH, defP, atkP, isStochastic) 
    };
}

function createBuckets() { return { 101:0, 102:0, 103:0, 104:0, 105:0, 106:0, 201:0, 202:0, 203:0, 204:0, 205:0 }; }

function applyToBucket(buckets, skill, uptime) {
    const units = skill.units || ["inf", "cav", "arc"];
    skill.ids.forEach((id, idx) => {
        const rawM = Array.isArray(skill.m) ? skill.m[idx] : skill.m;
        units.forEach(u => {
            let mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
            buckets[u][id] += (mag * (skill.instances || 1) * uptime);
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
            avgBase[u].atk += stats[0] * count; avgBase[u].def += stats[1] * count; 
            avgBase[u].leth += stats[2] * count; avgBase[u].hp += stats[3] * count;
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

function getHeroData(sideSetup) {
    const lineup = {}; 
    sideSetup.heroes.forEach((h, index) => {
        if (h.name === "None" || !HEROES[h.name]) return;
        if (!lineup[h.name]) lineup[h.name] = { lead: 0, joiner: 0, data: HEROES[h.name], levels: { s1: h.s1, s2: h.s2, s3: h.s3 } };
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
            const skillObj = { name: `${name} S${si+1}`, p, m, ids: s.ids, duration: s.duration || 1, instances, units: s.units };
            if (p >= 1.0) passives.push(skillObj); else actives.push(skillObj);
        });
    }
    return { passives, actives };
}

function finalizeLogs(side, triggers, hData, pData, oppP, isStochastic) {
    let list = [];
    [...hData.passives, ...hData.actives].forEach(act => {
        const isP = act.p >= 1.0;
        let val = isP ? "Passive" : (isStochastic ? `Procs: ${triggers[side][act.name] || 0}` : `Avg Proc: ${(act.p * 100).toFixed(0)}%`);
        list.push({ name: act.name, val, isPassive: isP });
    });
    ["Ambusher", "Volley", "Howling Wind", "Assault Lance", "Unyielding Shield"].forEach(n => {
        if (triggers[side][n] || (!isStochastic && n !== "Ambusher")) {
            list.push({ name: n, val: isStochastic ? `Procs: ${triggers[side][n] || 0}` : "Active", isPassive: !isStochastic });
        }
    });
    return { skills: list, troopEff: `Inf ${ (pData.weights.inf.tg3*100).toFixed(0) }% | Cav ${ (pData.weights.cav.tg3*100).toFixed(0) }% | Arc ${ (pData.weights.arc.tg3*100).toFixed(0) }%` };
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
