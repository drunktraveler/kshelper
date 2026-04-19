import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES } from './constants.js';

export function runCombatSim(setup) {
    let m_cur = { ...setup.atk.troops };
    let e_cur = { ...setup.def.troops };

    const totalAtkArmy = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalDefArmy = Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalAtkArmy, totalDefArmy));

    const m_skill_mults = getMultipliers(setup.atk, 'num');
    const e_skill_mults = getMultipliers(setup.def, 'den');

    const m_widget = Math.pow(1.15, 3);
    const e_widget = Math.pow(1.15, 3);

    let wave = 0;
    while (wave < 150 && isAlive(m_cur) && isAlive(e_cur)) {
        wave++;
        const m_f_long = ['infantry', 'cavalry', 'archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers';
        const e_f_long = ['infantry', 'cavalry', 'archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers';
        const m_f = m_f_long.slice(0, 3);
        const e_f = e_f_long.slice(0, 3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const s = setup[side], t = setup[target];
            const s_cur = (side === 'atk' ? m_cur : e_cur), t_cur = (side === 'atk' ? e_cur : m_cur);
            const tf_l = (side === 'atk' ? e_f_long : m_f_long);
            const tf_s = (side === 'atk' ? e_f : m_f);
            
            const s_mod_obj = (side === 'atk' ? m_skill_mults : e_skill_mults);
            const t_mod_obj = (side === 'atk' ? e_skill_mults : m_skill_mults);
            const s_wid = (side === 'atk' ? m_widget : e_widget);
            const t_wid = (side === 'atk' ? e_widget : m_widget);

            ['infantry', 'cavalry', 'archers'].forEach(u_l => {
                const u = u_l.slice(0, 3);
                if (s_cur[u] <= 0) return;

                const b = UNITS[u_l][s.tier][s.tg];
                const tb = UNITS[tf_l][t.tier][t.tg];

                let atk = b[0] * (1 + (s.stats[`${u}_att`] + s_mod_obj.star) / 100);
                let leth = b[2] * (1 + s.stats[`${u}_leth`] / 100);
                let df = tb[1] * (1 + (t.stats[`${tf_s}_def`] + t_mod_obj.star) / 100);
                let hp = tb[3] * (1 + t.stats[`${tf_s}_hp`] / 100);

                // --- 1. ALWAYS ACTIVE (Master Brawler / Charge / Ranged Strike) ---
                let type_m = 1.0;
                if ((u === 'inf' && tf_s === 'cav') || (u === 'cav' && tf_s === 'arc') || (u === 'arc' && tf_s === 'inf')) {
                    type_m = 1.1; 
                }

                // --- 2. TIER 7+ ABILITIES ---
                let tier_abil = 1.0;
                if (s.tier >= 7) {
                    if (u === 'arc') tier_abil *= 1.1; // Volley (+10% Dmg EV)
                    if (tf_s === 'inf' && u === 'cav') df *= 1.1; // Bands of Steel (+10% Def vs Cav)
                }

                // --- 3. TRUE GOLD ABILITIES (TG5 replaces TG3) ---
                let tg_abil = 1.0;
                if (u === 'arc') {
                    if (s.tg >= 5) tg_abil *= 1.15; // Howling Wind lv2 (+15% Dmg EV)
                    else if (s.tg >= 3) tg_abil *= 1.10; // Howling Wind lv1 (+10% Dmg EV)
                }
                if (u === 'cav') {
                    if (s.tg >= 5) tg_abil *= 1.15; // Assault Lance lv2 (+15% Dmg EV)
                    else if (s.tg >= 3) tg_abil *= 1.10; // Assault Lance lv1 (+10% Dmg EV)
                }
                if (tf_s === 'inf') {
                    if (t.tg >= 5) tg_abil *= 0.865; // Unyielding Shield lv2 (13.5% Mit EV)
                    else if (t.tg >= 3) tg_abil *= 0.91; // Unyielding Shield lv1 (9% Mit EV)
                }

                const s_mod = (s_mod_obj.units[u] || 1) * s_wid;
                const t_mod = (t_mod_obj.units[tf_s] || 1) * t_wid;

                // --- 4. CAVALRY BYPASS (Ambusher T7+) ---
                if (u === 'cav' && t_cur['arc'] > 1 && tf_s !== 'arc' && s.tier >= 7) {
                    // Front Damage (80%)
                    const f_dmg = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * type_m * tier_abil * tg_abil * 0.8 * s_mod) / (df * hp * 100 * t_mod);
                    pending.push({ dict: t_cur, unit: tf_s, amt: f_dmg });
                    
                    // Backline Damage (20%)
                    const back_b = UNITS['archers'][t.tier][t.tg];
                    const b_df = back_b[1] * (1 + (t.stats['arc_def'] + t_mod_obj.star) / 100);
                    const b_hp = back_b[3] * (1 + t.stats['arc_hp'] / 100);
                    const b_dmg = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * 1.1 * tier_abil * tg_abil * 0.2 * s_mod) / (b_df * b_hp * 100 * (t_mod_obj.units['arc'] * t_wid));
                    pending.push({ dict: t_cur, unit: 'arc', amt: b_dmg });
                } else {
                    if (u === 'cav' && tf_s === 'arc') tier_abil *= 0.8; // Logic adjustment for Cav vs Arch
                    const kills = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * type_m * tier_abil * tg_abil * s_mod) / (df * hp * 100 * t_mod);
                    pending.push({ dict: t_cur, unit: tf_s, amt: kills });
                }
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }
    return { m_cur, e_cur, wave, atk_mults: m_skill_mults.logs, def_mults: e_skill_mults.logs };
}

function getMultipliers(side, type) {
    let pools = {}, starBonus = 0, logs = [];
    
    // --- Log Troop Abilities ---
    if (side.tier >= 7) {
        logs.push(`Tier ${side.tier}: Infantry Bands of Steel Active`);
        logs.push(`Tier ${side.tier}: Cavalry Ambusher (20% Bypass) Active`);
        logs.push(`Tier ${side.tier}: Archer Volley (+10% Dmg) Active`);
    }
    if (side.tg >= 5) {
        logs.push(`TG5: Enhanced Shield/Lance/Wind (Lv2) Active`);
    } else if (side.tg >= 3) {
        logs.push(`TG3: Shield/Lance/Wind (Lv1) Active`);
    }

    side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        const d = HEROES[h.name];
        starBonus += GROWTH_TEMPLATES[d.template][(h.star * 6) + h.sub] || 0;
        const skills = (i < 3) ? d.skills : [d.skills[0]];
        skills.forEach((s, sIdx) => {
            if (s.group !== type && s.group !== 'den') return;
            const X = s.values[h[`s${sIdx + 1}`] - 1];
            const p = s.getChance(X), m = s.getMagnitude(X);
            let ev = (s.duration === 0) ? (p * m) : (1 - Math.pow(1 - p, s.duration)) * m;
            s.ids.forEach((id, idIdx) => {
                const val = Array.isArray(ev) ? ev[idIdx] : ev;
                pools[id] = (pools[id] || 0) + val;
            });
            logs.push(`${h.name}: ${s.name} (+${((Array.isArray(ev)?ev[0]:ev)*100).toFixed(1)}%)`);
        });
    });

    let finalMult = 1.0;
    Object.values(pools).forEach(sum => finalMult *= (1 + sum));
    return { units: { inf: finalMult, cav: finalMult, arc: finalMult }, star: starBonus, logs };
}

function isAlive(army) { return (army.inf + army.cav + army.arc) > 1; }
