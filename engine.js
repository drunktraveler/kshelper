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
    const defH = isBear ? { passives:[], actives:[] } : getHeroData(setup.def);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1000000 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    let wave = 0, triggers = { atk: {}, def: {} };
    let activeBuffs = { atk: [], def: [] }; 

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        
        // 1. GENERATE UNIT BUCKETS FOR THIS WAVE
        let currentMults = { atk: { self: {}, enemy: {} }, def: { self: {}, enemy: {} } };

        ['atk', 'def'].forEach(side => {
            const h = (side === 'atk' ? atkH : defH);
            const luck = (side === 'atk' ? atkLuck : defLuck);
            
            let unitBuckets = {
                inf: { 1: 1.0, 2: 1.0 }, // 1 = Self Buff Product (1XX), 2 = Enemy Debuff Product (2XX)
                cav: { 1: 1.0, 2: 1.0 },
                arc: { 1: 1.0, 2: 1.0 }
            };
            let global206 = 1.0;

            // Process all skills (Passives + Active Procs)
            const activeSkills = [...h.passives];
            
            if (isStochastic) {
                activeBuffs[side] = activeBuffs[side].filter(b => b.expires > wave);
                h.actives.forEach(act => {
                    let procced = false;
                    if (act.isAlcarS1) {
                        if (wave >= 5 && (wave % 5 === 0 || wave % 5 === 1)) procced = true;
                    } else {
                        if (Math.random() < (1 - Math.pow(1 - act.p, act.instances))) procced = true;
                    }
                    if (procced) {
                        triggers[side][act.name] = (triggers[side][act.name] || 0) + 1;
                        activeBuffs[side].push({ m: act.m, ids: act.ids, expires: wave + (isBear ? 1 : act.duration), inst: act.isAlcarS1 ? act.instances : 1 });
                    }
                });
                activeBuffs[side].forEach(b => activeSkills.push({ m: b.m, ids: b.ids, instances: b.inst, uptime: 1.0 }));
            } else {
                // Deterministic EV
                h.actives.forEach(act => {
                    const p = act.p;
                    const sigma = Math.sqrt(p * (1 - p) / 12);
                    const pShifted = luck === 'average' ? p : (luck === 'lucky' ? Math.min(1, p + 1.96 * sigma) : Math.max(0, p - 1.96 * sigma));
                    const uptime = act.isAlcarS1 ? 0.4 : (1 - Math.pow(1 - pShifted, isBear ? 1 : act.duration));
                    activeSkills.push({ m: act.m, ids: act.ids, instances: act.instances, uptime });
                });
            }

            activeSkills.forEach(skill => {
                const uptime = skill.uptime || 1.0;
                skill.ids.forEach((id, idx) => {
                    if (isBear && id >= 200) return;
                    const rawM = Array.isArray(skill.m) ? skill.m[idx] : skill.m;
                    const type = id < 200 ? 1 : 2; // 1XX vs 2XX

                    ['inf', 'cav', 'arc'].forEach(u => {
                        const mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
                        if (id === 206) global206 += (mag * skill.instances * uptime);
                        else unitBuckets[u][type] += (mag * skill.instances * uptime);
                    });
                });
            });

            ['inf', 'cav', 'arc'].forEach(u => {
                currentMults[side].self[u] = unitBuckets[u][1];
                currentMults[side].enemy[u] = unitBuckets[u][2] * global206;
            });
        });

        // 2. DAMAGE CALCULATION
        let pending = [];
        const units = ['inf', 'cav', 'arc'];
        const mf = units.find(u => m_cur[u] >= 1) || 'arc';
        const ef = units.find(u => e_cur[u] >= 1) || 'arc';

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return;
            const sP = (side === 'atk' ? atkP : defP), tP = (side === 'atk' ? defP : atkP);
            const sC = (side === 'atk' ? m_cur : e_cur), tC = (side === 'atk' ? e_cur : m_cur);
            const sS = setup[side], tS = setup[target];
            const tf = (side === 'atk' ? ef : mf);

            units.forEach(u => {
                if (sC[u] < 1) return;
                
                // Kill Mult: My Buffs / Target's Defensive Debuffs
                const totalMult = currentMults[side].self[u] * currentMults[side].enemy[tf];

                const calcKills = (targetType, abilMod = 1.0) => {
                    const b = sP.avgBase[u], tb = tP.avgBase[targetType];
                    const atk = b.atk * (1 + sS.stats[u+'_att']/100);
                    const leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                    const df = tb.def * (1 + tS.stats[targetType+'_def']/100);
                    const hp = tb.hp * (1 + tS.stats[targetType+'_hp']/100);
                    const rps = (u==='inf'&&targetType=='cav') || (u==='cav'&&targetType=='arc') || (u==='arc'&&targetType=='inf') ? 1.1 : 1.0;
                    const res = (Math.sqrt(sC[u]) * sq_min * atk * leth * rps * abilMod * totalMult) / (df * hp * 100);
                    return isNaN(res) ? 0 : res;
                };

                // Troop Abilities (T7/TG5)
                let abil = 1.0;
                if (u === 'arc') abil *= 1.1; 
                if (tf === 'inf' && u === 'cav') abil *= 0.9;
                if (sP.weights[u].tg5 > 0) {
                    if (u === 'arc') abil *= 1.15;
                    if (u === 'cav') abil *= 1.075;
                }
                if (tP.weights[tf].tg5 > 0 && tf === 'inf') abil *= (1 - (0.375 * 0.36));

                // Cavalry Bypass Logic (80/20)
                if (u === 'cav' && tC['arc'] >= 1 && tf !== 'arc' && !isBear) {
                    const kills = calcKills(tf, abil);
                    pending.push({dict: tC, unit: tf, amt: kills * 0.8});
                    pending.push({dict: tC, unit: 'arc', amt: kills * 0.2});
                } else {
                    pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil)});
                }
            });
        });

        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
        if (isBear) break;
    }

    return { 
        m_cur, e_cur, wave, 
        atk_logs: { skills: [], troopEff: "" }, // Simplified logs for now
        def_logs: { skills: [], troopEff: "" }, 
        totalDmg: isBear ? (1000000 - e_cur.inf) : 0 
    };
}

   const finalizeLogs = (side, hData) => {
    let list = [];
    const sideHeroes = side === 'atk' ? setup.atk.heroes : setup.def.heroes;
    const p = side === 'atk' ? atkP : defP;
    let t7 = []; 
    ['inf','cav','arc'].forEach(u => { if(p.weights[u].t7 > 0) t7.push(`${u.toUpperCase()}(${(p.weights[u].t7*100).toFixed(0)}%)`)});
    
    const manifest = {};
    sideHeroes.forEach((h, idx) => {
        if (h.name === "None") return;
        const d = HEROES[h.name];
        d.skills.forEach((s, si) => {
            const instances = (idx < 3 ? 1 : 0) + (si === 0 && idx >= 3 ? 1 : 0);
            if (instances === 0) return;
            const x = s.values[(h[`s${si+1}`] || 5) - 1];
            const chance = s.getChance(x), mag = s.getMagnitude(x);
            const key = `${h.name} ${s.name}`;

            if (chance >= 1.0) {
                if (!manifest[key]) manifest[key] = { mag: Array.isArray(mag) ? mag.map(v => 0) : 0, isPassive: true };
                if (Array.isArray(mag)) manifest[key].mag = manifest[key].mag.map((v, i) => v + mag[i] * instances);
                else manifest[key].mag += mag * instances;
            } else {
                manifest[key] = { isPassive: false, mag: mag, p: chance, dur: s.duration || 1 };
            }
        });
    });

    Object.entries(manifest).forEach(([name, data]) => {
        let val = data.isPassive 
            ? (Array.isArray(data.mag) ? data.mag.map(v => `+${(v*100).toFixed(1)}%`).join('/') : `+${(data.mag*100).toFixed(1)}%`)
            : (isStochastic ? `Triggers: ${triggers[side][name] || 0}` : `Eff: +${((Array.isArray(data.mag)?data.mag[0]:data.mag) * (1-Math.pow(1-data.p, data.dur))*100).toFixed(1)}%`);
        list.push({ name, val, isPassive: data.isPassive });
    });

    return { skills: list, troopEff: t7.join(' | ') };
};

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
                isAlcarS3: (name === "Alcar" && si === 2),
                isAlcarS1: (name === "Alcar" && si === 0)
            };

            // Treat Alcar S3 as Passive (100% uptime)
            if (p >= 1.0 || skillObj.isAlcarS3) passives.push(skillObj);
            else actives.push(skillObj);
        });
    }
    return { passives, actives };
}
