import { UNITS } from './units.js';
import { HEROES } from './heroes.js';

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

    // WAVE 0 ARMY MIN CONSTANT
    const totalStartAtk = (atkP.counts.inf + atkP.counts.cav + atkP.counts.arc) || 1;
    const totalStartDef = (defP.counts.inf + defP.counts.cav + defP.counts.arc) || 1;
    const army_min_sqrt = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    let wave = 0, triggers = { atk: {}, def: {} };

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        
        let buckets = {
            atk: { inf: createBuckets(), cav: createBuckets(), arc: createBuckets() },
            def: { inf: createBuckets(), cav: createBuckets(), arc: createBuckets() }
        };

        // 1. Hero Multiplier Application
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

        // 2. Damage Buffers (Simultaneous Resolution)
        let losses = { atk: {inf:0,cav:0,arc:0}, def: {inf:0,cav:0,arc:0} };

        const runSide = (side, opp, self_cur, opp_cur, selfP, oppP) => {
            const sT = triggers[side];
            const oT = triggers[opp];

            ['inf', 'cav', 'arc'].forEach(u => {
                const count = self_cur[u];
                if (count <= 1) return;

                // --- TARGETING ---
                let target = opp_cur.inf > 1 ? 'inf' : (opp_cur.cav > 1 ? 'cav' : 'arc');
                let bypassActive = false;
                
                // Ambusher: 20% to bypass Inf/Cav to hit Arc
                if (u === 'cav' && selfP.weights.cav.t7 > 0 && opp_cur.arc > 1 && target !== 'arc') {
                    const bypassRate = 0.20 * selfP.weights.cav.t7;
                    if (isStochastic) {
                        if (Math.random() < bypassRate) { target = 'arc'; bypassActive = true; sT['Ambusher'] = (sT['Ambusher']||0)+1; }
                    } else { bypassActive = true; }
                }

                // --- OFFENSIVE MODIFIERS ---
                let offMod = 1.0;
                if (u === 'arc') {
                    const vChance = 0.10 * selfP.weights.arc.t7;
                    const hwChance = (selfP.weights.arc.tg5 > 0 ? 0.30 : (selfP.weights.arc.tg3 > 0 ? 0.20 : 0)) * (selfP.weights.arc.tg5 || selfP.weights.arc.tg3);
                    if (isStochastic) {
                        if (Math.random() < vChance) { offMod *= 2.0; sT['Volley'] = (sT['Volley']||0)+1; }
                        if (Math.random() < hwChance) { offMod *= 1.5; sT['Howling Wind'] = (sT['Howling Wind']||0)+1; }
                    } else {
                        offMod *= (1 + vChance) * (1 + (hwChance * 0.5));
                    }
                }
                if (u === 'cav') {
                    const alChance = (selfP.weights.cav.tg5 > 0 ? 0.15 : (selfP.weights.cav.tg3 > 0 ? 0.10 : 0)) * (selfP.weights.cav.tg5 || selfP.weights.cav.tg3);
                    if (isStochastic) {
                        if (Math.random() < alChance) { offMod *= 2.0; sT['Assault Lance'] = (sT['Assault Lance']||0)+1; }
                    } else {
                        offMod *= (1 + alChance);
                    }
                }

                // RPS (Moved into Multiplier)
                let rps = 1.0;
                if (u === 'inf' && target === 'cav') rps = 1.10; 
                if (u === 'cav' && target === 'arc') rps = 1.10; 
                if (u === 'arc' && target === 'inf') rps = 1.10; 

                // --- DEFENSIVE MODIFIERS ---
                let defMod = 1.0;
                if (target === 'inf' && u === 'cav' && oppP.weights.inf.t7 > 0) defMod *= 1.10;
                if (target === 'inf') {
                    const usChance = (oppP.weights.inf.tg5 > 0 ? 0.375 : (oppP.weights.inf.tg3 > 0 ? 0.25 : 0)) * (oppP.weights.inf.tg5 || oppP.weights.inf.tg3);
                    if (isStochastic) {
                        if (Math.random() < usChance) { defMod *= (1 / 0.64); oT['Unyielding Shield'] = (oT['Unyielding Shield']||0)+1; }
                    } else {
                        defMod *= (1 / (1 - (usChance * 0.36)));
                    }
                }

                // --- THE FORMULA ---
                const b = buckets[side][u];
                const ob = buckets[opp][target];
                const sS = setup[side].stats;
                const oS = setup[opp].stats;

                const totalOff = selfP.avgBase[u].atk * (sS[`${u}_att`]/100) * (1+b[101]) * (1+b[102]) * (1+b[103]) * (1+b[104]) * (1+b[105]) * (1+b[106]) * offMod;
                const totalLeth = (sS[`${u}_leth`]/100) * selfP.avgBase[u].leth;
                
                const heroDefMult = (1+ob[201]) * (1+ob[202]) * (1+ob[203]) * (1+ob[204]) * (1+ob[205]);
                const effHP = heroDefMult * (oS[`${target}_def`]/100) * oppP.avgBase[target].def * (oS[`${target}_hp`]/100) * oppP.avgBase[target].hp * defMod;

                let finalDmg = (Math.sqrt(count) * army_min_sqrt * totalOff * totalLeth) / (effHP || 1) * rps * 100;

                // --- OVERKILL HANDLING & APPLICATION ---
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
            if (!b[u]) return;
            const stats = UNITS[longU][b[u+'_tier']][b[u+'_tg']];
            totals[u] += b[u];
            avgBase[u].atk += stats[0] * b[u]; avgBase[u].def += stats[1] * b[u]; 
            avgBase[u].leth += stats[2] * b[u]; avgBase[u].hp += stats[3] * b[u];
            if (b[u+'_tier'] >= 7) weights[u].t7 += b[u];
            if (b[u+'_tg'] >= 3) weights[u].tg3 += b[u];
            if (b[u+'_tg'] >= 5) weights[u].tg5 += b[u];
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
        if (!lineup[h.name]) lineup[h.name] = { lead: 0, joiner: 0, data: HEROES[h.name], lvls: { s1: h.s1, s2: h.s2, s3: h.s3 } };
        if (index < 3) lineup[h.name].lead++; else lineup[h.name].joiner++;
    });
    let passives = [], actives = [];
    for (const name in lineup) {
        const h = lineup[name];
        h.data.skills.forEach((s, si) => {
            const instances = h.lead + (si === 0 ? h.joiner : 0);
            if (instances === 0) return;
            const lvl = h.lvls[`s${si+1}`] || 5;
            const x = s.values[lvl - 1];
            if (x === undefined) return;
            const p = s.getChance(x);
            const m = s.getMagnitude(x);
            const skillObj = { name: `${name} S${si+1}`, p, m, ids: s.ids, duration: s.duration || 1, instances, units: s.units };
            if (s.getChance(x) >= 1.0) passives.push(skillObj); else actives.push(skillObj);
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
