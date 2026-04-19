import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES } from './constants.js';

/**
 * Main Combat Simulation Entry Point
 * @param {Object} setup - The data object gathered by ui-bridge.js
 */
export function runCombatSim(setup) {
    // 1. Initialize Army Counts
    let m_cur = { ...setup.atk.troops };
    let e_cur = { ...setup.def.troops };

    // sq_min is used in the damage formula: sqrt(count) * sq_min
    const totalAtkArmy = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalDefArmy = Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalAtkArmy, totalDefArmy));

    // 2. Aggregate Hero & Widget Multipliers
    // Attacker looks for 'num' (Offense) skills, Defender looks for 'den' (Defense) skills
    const m_skill_mults = getMultipliers(setup.atk, 'num');
    const e_skill_mults = getMultipliers(setup.def, 'den');

    // Widgets: Standard 1.15^3 multiplier from your original script
    const m_widget = Math.pow(1.15, 3);
    const e_widget = Math.pow(1.15, 3);

    let wave = 0;
    
    // 3. Combat Loop (Max 150 Waves)
    while (wave < 150 && isAlive(m_cur) && isAlive(e_cur)) {
        wave++;
        
        // Identify current frontlines
        const m_f = ['infantry', 'cavalry', 'archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers';
        const e_f = ['infantry', 'cavalry', 'archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers';
        
        const m_f_short = m_f.slice(0, 3); // 'inf', 'cav', 'arc'
        const e_f_short = e_f.slice(0, 3);

        let pending = []; // Damage is calculated simultaneously and applied at wave end

        // Both sides attack each other
        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const s = setup[side];
            const t = setup[target];
            const s_cur = (side === 'atk' ? m_cur : e_cur);
            const t_cur = (side === 'atk' ? e_cur : m_cur);
            const sf_short = (side === 'atk' ? m_f_short : e_f_short);
            const tf_short = (side === 'atk' ? e_f_short : m_f_short);
            const tf_long = (side === 'atk' ? e_f : m_f);
            
            const s_mults = (side === 'atk' ? m_skill_mults : e_skill_mults);
            const t_mults = (side === 'atk' ? e_skill_mults : m_skill_mults);
            const s_wid = (side === 'atk' ? m_widget : e_widget);
            const t_wid = (side === 'atk' ? e_widget : m_widget);

            ['infantry', 'cavalry', 'archers'].forEach(u_long => {
                const u = u_long.slice(0, 3);
                if (s_cur[u] <= 0) return;

                // Lookup Base Stats from units.js (Tier/TG)
                const b = UNITS[u_long][s.tier][s.tg];
                const tb = UNITS[tf_long][t.tier][t.tg];

                // Power Calculation (Base * %Bonus)
                // Note: star bonuses are added to the Att/Def percentage
                let atk = b[0] * (1 + (s.stats[`${u}_att`] + s_mults.star) / 100);
                let leth = b[2] * (1 + s.stats[`${u}_leth`] / 100);
                let df = tb[1] * (1 + (t.stats[`${tf_short}_def`] + t_mults.star) / 100);
                let hp = tb[3] * (1 + t.stats[`${tf_short}_hp`] / 100);

                // Type Matchups (1.1x Advantage)
                let tm = 1.0;
                if ((u === 'inf' && tf_short === 'cav') || 
                    (u === 'cav' && tf_short === 'arc') || 
                    (u === 'arc' && tf_short === 'inf')) tm = 1.1;
                
                // Specific TG3 Ability Multipliers
                let abil = 1.0;
                if (u === 'arc') abil *= 1.21; // Archers double miss/crit
                if (u === 'cav') abil *= 1.1;  // Cavalry double hit
                if (tf_short === 'inf') abil *= 0.91; // Infantry block logic

                // Combine Hero Skills and Widgets
                const s_mod = s_mults.units[u] * s_wid;
                const t_mod = t_mults.units[tf_short] * t_wid;

                // Cavalry Bypass Logic (80% front, 20% archer backline)
                if (u === 'cav' && t_cur['arc'] > 1 && tf_short !== 'arc') {
                    // Front Damage
                    const f_dmg = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * tm * abil * 0.8 * s_mod) / (df * hp * 100 * t_mod);
                    pending.push({ dict: t_cur, unit: tf_short, amt: f_dmg });
                    
                    // Backline Damage (20%)
                    const back_b = UNITS['archers'][t.tier][t.tg];
                    const b_df = back_b[1] * (1 + t.stats['arc_def'] / 100);
                    const b_hp = back_b[3] * (1 + t.stats['arc_hp'] / 100);
                    const b_mod = t_mults.units['arc'] * t_wid;
                    const b_dmg = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * 1.1 * abil * 0.2 * s_mod) / (b_df * b_hp * 100 * b_mod);
                    pending.push({ dict: t_cur, unit: 'arc', amt: b_dmg });
                } else {
                    // Standard Damage
                    if (u === 'cav' && tf_short === 'arc') abil *= 0.8; // Logic for Cav vs Archers
                    const kills = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * tm * abil * s_mod) / (df * hp * 100 * t_mod);
                    pending.push({ dict: t_cur, unit: tf_short, amt: kills });
                }
            });
        });

        // Apply all damage simultaneously
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }

    return { m_cur, e_cur, wave };
}

/**
 * Calculates global multipliers for a side based on heroes
 */
function getMultipliers(side, type) {
    let pools = {}; // Additive pools per Skill ID
    let starBonus = 0;

    side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        const d = HEROES[h.name];
        
        // 1. Calculate the Star Bonus (All Att / All Def)
        const template = GROWTH_TEMPLATES[d.template];
        const substageIndex = (h.star * 6) + h.sub;
        starBonus += template[substageIndex] || 0;

        // 2. Process Skills (Leaders get 3, Joiners get 1)
        const activeSkills = (i < 3) ? d.skills : [d.skills[0]];

        activeSkills.forEach((s, sIdx) => {
            if (s.group !== type) return;

            const skillLv = h[`s${sIdx + 1}`];
            const X = s.values[skillLv - 1];
            
            // Expected Value Calculation
            const p = s.getChance(X);
            const m = s.getMagnitude(X);
            const ev = (s.duration === 0) ? (p * m) : (1 - Math.pow(1 - p, s.duration)) * m;

            // Simple additive stacking by Skill ID
            s.ids.forEach((id, idIdx) => {
                const val = Array.isArray(ev) ? ev[idIdx] : ev;
                pools[id] = (pools[id] || 0) + val;
            });
        });
    });

    // 3. Convert Additive Pools to Multipliers: (1 + sum_id1) * (1 + sum_id2)
    let finalMult = 1.0;
    Object.values(pools).forEach(sum => {
        finalMult *= (1 + sum);
    });

    return {
        units: { inf: finalMult, cav: finalMult, arc: finalMult },
        star: starBonus
    };
}

function isAlive(army) {
    return (army.inf + army.cav + army.arc) > 1;
}
