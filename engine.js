import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 1000, isBear = false, isOptimizing = false) {
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
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1000000 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    const getEffStr = (p) => `Inf ${(p.weights.inf.tg3 * 100).toFixed(0)}% | Cav ${(p.weights.cav.tg3 * 100).toFixed(0)}% | Arc ${(p.weights.arc.tg3 * 100).toFixed(0)}%`;

    let wave = 0, triggers = { atk: {}, def: {} };
    let activeBuffs = { atk: [], def: [] };

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        let waveMults = { 
            atk: { self: {inf:1,cav:1,arc:1}, survival: {inf:1,cav:1,arc:1} }, 
            def: { self: {inf:1,cav:1,arc:1}, survival: {inf:1,cav:1,arc:1} } 
        };

        ['atk', 'def'].forEach(side => {
            const h = (side === 'atk' ? atkH : defH);
            let unitBuckets = { inf: { 1:0, 2:0 }, cav: { 1:0, 2:0 }, arc: { 1:0, 2:0 } };
            let global206 = 0;
            const currentActiveSkills = [...h.passives];

            if (isStochastic) {
                activeBuffs[side] = activeBuffs[side].filter(b => b.expires > wave);
                h.actives.forEach(act => {
                    let procced = false;
                    if (act.isAlcarS1) { if (wave >= 5 && (wave % 5 === 0 || wave % 5 === 1)) procced = true; }
                    else { if (Math.random() < (1 - Math.pow(1 - act.p, act.instances))) procced = true; }
                    if (procced) {
                        triggers[side][act.name] = (triggers[side][act.name] || 0) + 1;
                        activeBuffs[side].push({ m: act.m, ids: act.ids, expires: wave + (isBear ? 1 : act.duration), inst: act.isAlcarS1 ? act.instances : 1 });
                    }
                });
                activeBuffs[side].forEach(b => currentActiveSkills.push({ m: b.m, ids: b.ids, instances: b.inst, uptime: 1.0 }));
            } else {
                h.actives.forEach(act => {
                    const uptime = act.isAlcarS1 ? 0.4 : (1 - Math.pow(1 - act.p, isBear ? 1 : act.duration));
                    currentActiveSkills.push({ m: act.m, ids: act.ids, instances: act.instances, uptime });
                });
            }

            currentActiveSkills.forEach(s => {
                const up = s.uptime || 1.0;
                s.ids.forEach((id, idx) => {
                    const rawM = Array.isArray(s.m) ? s.m[idx] : s.m;
                    ['inf', 'cav', 'arc'].forEach(u => {
                        const mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
                        const final = mag * s.instances * up;
                        if (id === 206) global206 += final;
                        else if (id < 200) unitBuckets[u][1] += final;
                        else unitBuckets[u][2] += final;
                    });
                });
            });

            ['inf', 'cav', 'arc'].forEach(u => {
                waveMults[side].self[u] = (1 + unitBuckets[u][1]);
                waveMults[side].survival[u] = (1 + unitBuckets[u][2]) * (1 + global206);
            });
        });

        let pending = [];
        const units = ['inf', 'cav', 'arc'];
        const mf = units.find(u => m_cur[u] >= 1) || 'arc';
        const ef = units.find(u => e_cur[u] >= 1) || 'arc';

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return;
            const sP = (side==='atk'?atkP:defP), tP = (side==='atk'?defP:atkP);
            const sC = (side==='atk'?m_cur:e_cur), tC = (side==='atk'?e_cur:m_cur);
            const sS = setup[side], tS = setup[target], tf = (side==='atk'?ef:mf);

            units.forEach(u => {
                if (sC[u] < 1) return;

                const roll = (p, name) => {
                    const hit = isStochastic ? (Math.random() < p) : true;
                    if (hit && isStochastic) triggers[side][name] = (triggers[side][name] || 0) + 1;
                    return isStochastic ? (hit ? 1 : 0) : p;
                };

                const calcKillsForTarget = (targetUnit) => {
                    let offMod = 1.0; let defMod = 1.0;

                    // A. RPS & Passive Checks based on REAL targetUnit (Frontline or Bypass)
                    if (u === 'inf' && targetUnit === 'cav') { offMod *= 1.1; triggers[side]["Master Brawler"] = true; }
                    if (u === 'cav' && targetUnit === 'arc') { offMod *= 1.1; triggers[side]["Charge"] = true; }
                    if (u === 'arc' && targetUnit === 'inf') { offMod *= 1.1; triggers[side]["Ranged Strike"] = true; }

                    if (targetUnit === 'inf' && u === 'cav' && tP.weights.inf.t7 > 0) {
                        defMod *= (1 / 1.1); // Bands of Steel
                        triggers[target]["Bands of Steel"] = true;
                    }

                    // B. T7/TG Procs
                    if (u === 'arc' && sP.weights.arc.t7 > 0) offMod *= (1 + roll(0.1, "Volley") * sP.weights.arc.t7);
                    
                    const w = sP.weights[u], tw = tP.weights[targetUnit];
                    if (u === 'arc' && w.tg3 > 0) offMod *= (1 + roll(w.tg5 > 0 ? 0.3 : 0.2, "Howling Wind") * (0.5 * w.tg3));
                    if (u === 'cav' && w.tg3 > 0) offMod *= (1 + roll(w.tg5 > 0 ? 0.15 : 0.1, "Assault Lance") * (1.0 * w.tg3));
                    if (targetUnit === 'inf' && tw.tg3 > 0) defMod *= (1 / (1 + roll(tw.tg5 > 0 ? 0.375 : 0.25, "Unyielding Shield") * (0.36 * tw.tg3)));

                    const finalKillMult = (waveMults[side].self[u] * offMod) / (waveMults[target].survival[targetUnit] * defMod);
                    
                    const b = sP.avgBase[u], tb = tP.avgBase[targetUnit];
                    const atk = b.atk * (1 + sS.stats[u+'_att']/100);
                    const leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                    const df = tb.def * (1 + tS.stats[targetUnit+'_def']/100);
                    const hp = tb.hp * (1 + tS.stats[targetUnit+'_hp']/100);
                    return (Math.sqrt(sC[u]) * sq_min * atk * leth * finalKillMult) / (df * hp * 100);
                };

                // D. Ambusher (Bypass) Logic
                if (u === 'cav' && sP.weights.cav.t7 > 0 && tC['arc'] >= 1 && tf !== 'arc' && !isBear) {
                    const isBypass = isStochastic ? (Math.random() < 0.2) : 0.2;
                    if (isBypass && isStochastic) triggers[side]["Ambusher"] = (triggers[side]["Ambusher"] || 0) + 1;
                    
                    if (isBypass === 1 || (!isStochastic && isBypass > 0)) {
                        const bypassKills = calcKillsForTarget('arc');
                        const frontlineKills = calcKillsForTarget(tf);
                        
                        pending.push({dict: tC, unit: 'arc', amt: bypassKills * (isStochastic ? 1 : 0.2)});
                        if (!isStochastic) pending.push({dict: tC, unit: tf, amt: frontlineKills * 0.8});
                    } else {
                        pending.push({dict: tC, unit: tf, amt: calcKillsForTarget(tf)});
                    }
                } else {
                    pending.push({dict: tC, unit: tf, amt: calcKillsForTarget(tf)});
                }
            });
        });

        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
        if (isBear) break;
    }

    const finalizeLogs = (side) => {
        let list = [];
        const hData = (side === 'atk' ? atkH : defH);
        const pData = (side === 'atk' ? atkP : defP);
        const oppP = (side === 'atk' ? defP : atkP);

        [...hData.passives, ...hData.actives].forEach(act => {
            const isP = act.p >= 1.0 || act.isAlcarS3;
            let val = isP ? (typeof act.m === 'object' ? `+${(act.m.inf*100).toFixed(0)}%` : `+${(act.m*100).toFixed(0)}%`) :
                (isStochastic ? `Triggers: ${triggers[side][act.name] || 0}` : `EV Applied`);
            list.push({ name: act.name, val, isPassive: isP });
        });

        const chanceAbils = [
            { n: "Ambusher", w: pData.weights.cav.t7, p: 0.2, m: 1.0 },
            { n: "Volley", w: pData.weights.arc.t7, p: 0.1, m: 1.0 },
            { n: "Unyielding Shield", w: pData.weights.inf.tg3, p: (pData.weights.inf.tg5 > 0 ? 0.375 : 0.25), m: 0.36 },
            { n: "Assault Lance", w: pData.weights.cav.tg3, p: (pData.weights.cav.tg5 > 0 ? 0.15 : 0.1), m: 1.0 },
            { n: "Howling Wind", w: pData.weights.arc.tg3, p: (pData.weights.arc.tg5 > 0 ? 0.3 : 0.2), m: 0.5 }
        ];
        chanceAbils.forEach(a => {
            if (a.w > 0) {
                const label = isStochastic ? `Triggers: ${triggers[side][a.n] || 0}` : `Eff: +${(a.p * a.m * a.w * 100).toFixed(1)}%`;
                list.push({ name: a.n, val: label, isPassive: false });
            }
        });

        const passives = [];
        // CHECK ARCHER LOG: Frontline or Bypass check
        const hitArchers = (oppP.counts.arc > 0 && (mf === 'arc' || pData.weights.cav.t7 > 0));
        if (pData.counts.inf > 0 && oppP.counts.cav > 0) passives.push("Master Brawler (+10%)");
        if (pData.counts.cav > 0 && hitArchers) passives.push("Charge (+10%)");
        if (pData.counts.arc > 0 && oppP.counts.inf > 0) passives.push("Ranged Strike (+10%)");
        if (pData.counts.inf > 0 && oppP.counts.cav > 0 && pData.weights.inf.t7 > 0) passives.push("Bands of Steel (+10% Def)");
        
        if (passives.length > 0) list.push({ name: "Troop Passives", val: passives.join(", "), isPassive: true });

        return { skills: list, troopEff: getEffStr(pData) };
    };

    return { m_cur, e_cur, wave, atk_logs: finalizeLogs('atk'), def_logs: finalizeLogs('def'), totalDmg: isBear ? (1000000 - e_cur.inf) : 0 };
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
