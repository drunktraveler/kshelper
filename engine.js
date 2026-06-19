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
        
        // --- 1. WAVE SNAPSHOT (Symmetry Logic) ---
        const atkSnap = { ...m_cur }, defSnap = { ...e_cur };
        let damageToAtk = { inf: 0, cav: 0, arc: 0 };
        let damageToDef = { inf: 0, cav: 0, arc: 0 };

        // Identify Targets from Snapshots (Ensures both sides hit the same frontline)
        const atkTargetUnit = (['inf', 'cav', 'arc'].find(u => defSnap[u] >= 1) || 'arc');
        const defTargetUnit = (['inf', 'cav', 'arc'].find(u => atkSnap[u] >= 1) || 'arc');

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

            const actives = [...h.passives];
            if (isStochastic) {
                activeBuffs[side] = activeBuffs[side].filter(b => b.expires > wave);
                h.actives.forEach(act => {
                    let proc = false;
                    if (act.minWave && act.interval) {
                        if (wave >= act.minWave && (wave - act.minWave) % act.interval < act.duration) proc = true;
                    } else if (Math.random() < (1 - Math.pow(1 - act.p, act.instances))) proc = true;

                    if (proc) {
                        triggers[side][act.name] = (triggers[side][act.name] || 0) + 1;
                        if (!act.interval) activeBuffs[side].push({ ...act, expires: wave + act.duration });
                        else applyToBucket(b, act, 1.0);
                    }
                });
                activeBuffs[side].forEach(ab => applyToBucket(b, ab, 1.0));
            } else {
                h.actives.forEach(act => {
                    let up = 0;
                    if (act.minWave && act.interval) up = (act.duration / act.interval) * (Math.max(0, nWaves - act.minWave + 1) / nWaves);
                    else {
                        const d = isBear ? 1 : (act.duration || 1);
                        up = 1 - Math.pow(1 - act.p, d);
                        if (act.minWave) up *= (Math.max(0, nWaves - act.minWave + 1) / nWaves);
                    }
                    applyToBucket(b, act, up);
                });
            }
            actives.forEach(s => applyToBucket(b, s, 1.0));

            ['inf', 'cav', 'arc'].forEach(u => {
                waveMults[side][u].off = (1 + b[u][101]) * b[u][102] * b[u][103] * b[u][104] * b[u][105] * b[u][106];
                waveMults[side][u].surv = (1 + b[u][201]) * b[u][202] * b[u][203] * b[u][204] * b[u][205];
                waveMults[side][u].dodge = b[u][250];
            });
        });

        // --- 2. THE CLASH ---
        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return;
            const sP = (side === 'atk' ? atkP : defP), tP = (side === 'atk' ? defP : atkP);
            const sSnap = (side === 'atk' ? atkSnap : defSnap);
            const tSnap = (side === 'atk' ? defSnap : atkSnap);
            const sS = setup[side], tS = setup[target];
            const tf = (side === 'atk' ? atkTargetUnit : defTargetUnit);
            const pDamage = (side === 'atk' ? damageToDef : damageToAtk);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sSnap[u] < 1) return;
                const roll = (p) => isStochastic ? (Math.random() < p ? 1 : 0) : p;

                const calcK = (tType, rat = 1.0) => {
                    let offM = 1.0, defM = 1.0;
                    if (u === 'inf' && tType === 'cav') offM *= 1.1;
                    if (u === 'cav' && tType === 'arc') offM *= 1.1;
                    if (u === 'arc' && tType === 'inf') offM *= 1.1;

                    const w = sP.weights[u], tw = tP.weights[tType];
                    if (u === 'arc') offM *= (1 + (roll(0.1) * w.t7));
                    if (tType === 'inf' && u === 'cav') defM *= (1 / (1 + (0.1 * tw.t7)));
                    if (u === 'arc') offM *= (1 + (roll((0.3 * w.tg5) + (0.2 * (w.tg3 - w.tg5))) * 0.5));
                    if (u === 'cav') offM *= (1 + (roll((0.15 * w.tg5) + (0.1 * (w.tg3 - w.tg5))) * 1.0));
                    if (tType === 'inf') defM *= (1 / (1 + (roll((0.375 * tw.tg5) + (0.25 * (tw.tg3 - tw.tg5))) * 0.36)));

                    const b = sP.avgBase[u], tb = tP.avgBase[tType];
                    let fM = (waveMults[side][u].off * offM) / (waveMults[target][tType].surv * defM);
                    if (!isStochastic) fM *= (1 - waveMults[target][tType].dodge);

                    const atk = b.atk * (1 + sS.stats[u+'_att']/100);
                    const leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                    const df = tb.def * (1 + tS.stats[tType+'_def']/100);
                    const hp = tb.hp * (1 + tS.stats[tType+'_hp']/100);
                    return (Math.sqrt(sSnap[u]) * sq_min * atk * leth * fM) / (df * hp * 100) * rat;
                };

                if (u === 'cav' && sP.weights.cav.t7 > 0 && tSnap['arc'] >= 1 && tf !== 'arc' && !isBear) {
                    const bC = 0.2 * sP.weights.cav.t7;
                    pDamage['arc'] += calcK('arc', isStochastic ? (roll(bC) ? 1 : 0) : bC);
                    pDamage[tf] += calcK(tf, isStochastic ? (roll(bC) ? 0 : 1) : (1 - bC));
                } else pDamage[tf] += calcK(tf);
            });
        });

        // --- 3. APPLY DAMAGE SIMULTANEOUSLY ---
        ['inf', 'cav', 'arc'].forEach(u => {
            m_cur[u] = Math.max(0, m_cur[u] - damageToAtk[u]);
            e_cur[u] = Math.max(0, e_cur[u] - damageToDef[u]);
        });
        if (isBear) break;
    }

    // Floating Point Clean-up for Draws
    const sumA = m_cur.inf + m_cur.cav + m_cur.arc;
    const sumD = e_cur.inf + e_cur.cav + e_cur.arc;
    if (Math.abs(sumA - sumD) < 0.1) m_cur = { ...e_cur };

    return { m_cur, e_cur, wave, totalDmg: isBear ? (1000000 - e_cur.inf) : 0, atk_logs: finalizeLogs('atk', triggers, atkH, atkP, defP, isStochastic), def_logs: finalizeLogs('def', triggers, defH, defP, atkP, isStochastic) };
}

function applyToBucket(buckets, skill, uptime) {
    const affected = skill.units || ["inf", "cav", "arc"];
    skill.ids.forEach((id, idx) => {
        const rawM = Array.isArray(skill.m) ? skill.m[idx] : skill.m;
        affected.forEach(u => {
            let mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
            let final = mag * skill.instances * uptime;
            if (id === 101 || id === 201 || id === 250) buckets[u][id] += final;
            else buckets[u][id] *= (1 + final);
        });
    });
}

function processBatches(batches) {
    let totals = {inf:0,cav:0,arc:0}, avgBase = {inf:{atk:0,def:0,leth:0,hp:0},cav:{atk:0,def:0,leth:0,hp:0},arc:{atk:0,def:0,leth:0,hp:0}};
    let weights = {inf:{t7:0,tg3:0,tg5:0},cav:{t7:0,tg3:0,tg5:0},arc:{t7:0,tg3:0,tg5:0}};
    batches.forEach(b => {
        ['inf','cav','arc'].forEach(u => {
            const lU = u==='arc'?'archers':(u==='inf'?'infantry':'cavalry');
            const t = b[u+'_tier'], tg = b[u+'_tg'], c = b[u];
            if (!c) return;
            const stats = UNITS[lU][t][tg];
            totals[u] += c;
            avgBase[u].atk += stats[0] * c; avgBase[u].def += stats[1] * c; 
            avgBase[u].leth += stats[2] * c; avgBase[u].hp += stats[3] * c;
            if (t >= 7) weights[u].t7 += c;
            if (tg >= 3) weights[u].tg3 += c;
            if (tg >= 5) weights[u].tg5 += c;
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

function getHeroData(setup) {
    const lineup = {}; 
    setup.heroes.forEach((h, index) => {
        if (!h || h.name === "None" || !HEROES[h.name]) return;
        if (!lineup[h.name]) lineup[h.name] = { lead: 0, joiner: 0, data: HEROES[h.name], levels: { s1: h.s1, s2: h.s2, s3: h.s3 } };
        if (index < 3) lineup[h.name].lead++; else lineup[h.name].joiner++;
    });
    let p = [], a = [];
    for (const n in lineup) {
        const h = lineup[n];
        h.data.skills.forEach((s, si) => {
            const inst = h.lead + (si === 0 ? h.joiner : 0);
            if (inst === 0) return;
            const lvl = h.levels[`s${si+1}`] || 5;
            const x = s.values[lvl - 1];
            const obj = { name: `${n} ${s.name}`, p: s.getChance(x), m: s.getMagnitude(x), ids: s.ids, duration: s.duration || 1, instances: inst, units: s.units || null, minWave: s.minWave || 0, interval: s.interval || 0 };
            if (obj.p >= 1.0) p.push(obj); else a.push(obj);
        });
    }
    return { passives: p, actives: a };
}

function finalizeLogs(side, triggers, hData, pData, oppP, isStochastic) {
    let list = [];
    [...hData.passives, ...hData.actives].forEach(act => {
        const isP = act.p >= 1.0;
        let val = isP ? "Passive" : (isStochastic ? `Triggers: ${triggers[side][act.name] || 0}` : `Proc: ${(act.p * 100).toFixed(0)}%`);
        list.push({ name: act.name, val, isPassive: isP });
    });
    return { skills: list, troopEff: `Inf ${Math.round(pData.weights.inf.tg3*100)}% | Cav ${Math.round(pData.weights.cav.tg3*100)}% | Arc ${Math.round(pData.weights.arc.tg3*100)}%` };
}
