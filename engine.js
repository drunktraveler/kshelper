import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 1000, isBear = false) {
    const isStochastic = (atkLuck === 'stochastic');
    const atkP = processBatches(setup.atk.batches);
    const defP = isBear ? {
        counts: { inf: 5000, cav: 0, arc: 0 },
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
            atk: { inf: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 }, cav: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 }, arc: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 } },
            def: { inf: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 }, cav: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 }, arc: { 101:0, 102:1, 103:1, 104:1, 105:1, 106:1, 201:0, 202:1, 203:1, 204:1, 205:1, 250:0 } }
        };

        ['atk', 'def'].forEach(side => {
            const h = (side === 'atk' ? atkH : defH);
            h.passives.forEach(p => applyToBucket(buckets[side], p, 1.0));
            h.actives.forEach(act => {
                let uptime = isStochastic ? (Math.random() < (1 - Math.pow(1 - act.p, act.instances)) ? 1 : 0) : act.p;
                if (uptime > 0) {
                    applyToBucket(buckets[side], act, uptime);
                    if (isStochastic) triggers[side][act.name] = (triggers[side][act.name] || 0) + 1;
                }
            });
        });

        // SIMULTANEOUS DAMAGE: Calculate losses into temp variables
        let losses = { atk: {inf:0,cav:0,arc:0}, def: {inf:0,cav:0,arc:0} };

        // Attacker -> Defender
        ['inf', 'cav', 'arc'].forEach(u => {
            if (m_cur[u] <= 0) return;
            const target = e_cur.inf > 0 ? 'inf' : (e_cur.cav > 0 ? 'cav' : 'arc');
            const totalAtk = atkP.avgBase[u].atk * (1 + (setup.atk.stats[`${u}_att`]/100)) * (1 + buckets.atk[u][101]) * buckets.atk[u][102] * buckets.atk[u][103];
            const oppHP = defP.avgBase[target].hp * (1 + (setup.def.stats[`${target}_hp`]/100)) * (1 + buckets.def[target][201]) * buckets.def[target][202];
            losses.def[target] += (Math.sqrt(m_cur[u]) * totalAtk * atkP.avgBase[u].leth * (1 + (setup.atk.stats[`${u}_leth`]/100))) / (oppHP * 100);
        });

        // Defender -> Attacker (Unless Bear)
        if (!isBear) {
            ['inf', 'cav', 'arc'].forEach(u => {
                if (e_cur[u] <= 0) return;
                const target = m_cur.inf > 0 ? 'inf' : (m_cur.cav > 0 ? 'cav' : 'arc');
                const totalAtk = defP.avgBase[u].atk * (1 + (setup.def.stats[`${u}_att`]/100)) * (1 + buckets.def[u][101]) * buckets.def[u][102] * buckets.def[u][103];
                const oppHP = atkP.avgBase[target].hp * (1 + (setup.atk.stats[`${target}_hp`]/100)) * (1 + buckets.atk[target][201]) * buckets.atk[target][202];
                losses.atk[target] += (Math.sqrt(e_cur[u]) * totalAtk * defP.avgBase[u].leth * (1 + (setup.def.stats[`${u}_leth`]/100))) / (oppHP * 100);
            });
        }

        // Apply losses simultaneously
        ['inf', 'cav', 'arc'].forEach(u => {
            m_cur[u] = Math.max(0, m_cur[u] - losses.atk[u]);
            e_cur[u] = Math.max(0, e_cur[u] - losses.def[u]);
        });
    }

    return { m_cur, e_cur, wave, atk_logs: finalizeLogs('atk', triggers, atkH, atkP, defP, isStochastic), def_logs: finalizeLogs('def', triggers, defH, defP, atkP, isStochastic) };
}

        // 3. Resolve Damage
        const sides = [['atk', 'def', m_cur, e_cur, atkP, defP], ['def', 'atk', e_cur, m_cur, defP, atkP]];
        sides.forEach(([s, opp, self_cur, opp_cur, selfP, oppP]) => {
            ['inf', 'cav', 'arc'].forEach(u => {
                if (self_cur[u] <= 0) return;
                
                // Offense Calculation
                const b = buckets[s][u];
                const totalAtk = selfP.avgBase[u].atk * (1 + (setup[s].stats[`${u}_att`]/100)) * (1 + b[101]) * b[102] * b[103] * b[104] * b[105] * b[106];
                const totalLeth = selfP.avgBase[u].leth * (1 + (setup[s].stats[`${u}_leth`]/100));
                
                // Defense Calculation (Opponent)
                const targetUnit = isBear ? 'inf' : (opp_cur.inf > 0 ? 'inf' : (opp_cur.cav > 0 ? 'cav' : 'arc'));
                const ob = buckets[opp][targetUnit];
                const oppHP = oppP.avgBase[targetUnit].hp * (1 + (setup[opp].stats[`${targetUnit}_hp`]/100)) * (1 + ob[201]) * ob[202] * ob[203] * ob[204] * ob[205];
                
                const rawDmg = (Math.sqrt(self_cur[u]) * totalAtk * totalLeth) / (oppHP || 1);
                const dodgeRoll = ob[250] > 0 ? (Math.random() < ob[250] ? 0 : 1) : 1;
                
                opp_cur[targetUnit] -= (rawDmg * dodgeRoll) / 100;
                if (opp_cur[targetUnit] < 0) opp_cur[targetUnit] = 0;
            });
        });
    } // End While

    return {
        m_cur, e_cur, wave,
        atk_logs: finalizeLogs('atk', triggers, atkH, atkP, defP, isStochastic),
        def_logs: finalizeLogs('def', triggers, defH, defP, atkP, isStochastic)
    };
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
