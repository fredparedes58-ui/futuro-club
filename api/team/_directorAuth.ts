/**
 * Autorización de director de club (Rama B).
 *
 * Un club se ancla en `org_owner_id` (el director dueño). "Los 3 directores" =
 * el owner + hasta 2 miembros con role='director' en team_members. Un usuario
 * puede gestionar (aprobar/rechazar) solicitudes de un club si es director de
 * ESE club — no basta con tener role='director' global sobre su propia org.
 *
 * Fail-closed: ante cualquier duda (sin Supabase, query no-ok), devuelve false.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export async function isDirectorOfOrg(
  supabase: SupabaseClient,
  userId: string,
  orgOwnerId: string,
): Promise<boolean> {
  if (!userId || !orgOwnerId) return false;

  // Caso 1: es el director dueño del club (y su rol global es director).
  if (userId === orgOwnerId) {
    const { data } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", userId)
      .single();
    return data?.role === "director";
  }

  // Caso 2: es uno de los otros directores del club (team_members role=director).
  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("org_owner_id", orgOwnerId)
    .eq("member_id", userId)
    .eq("role", "director")
    .maybeSingle();
  return data?.role === "director";
}
