function groupBy(values, keySelector) {
  return values.reduce((groups, value) => {
    const key = keySelector(value);
    (groups[key] ??= []).push(value);
    return groups;
  }, {});
}

export async function introspectSchema(database) {
  const tableResult = await database.query(`
    select
      c.relname as name,
      obj_description(c.oid, 'pg_class') as description,
      c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `);

  const columnResult = await database.query(`
    select
      c.relname as table_name,
      a.attnum as ordinal,
      a.attname as name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
      t.typname as underlying_type,
      not a.attnotnull as nullable,
      pg_get_expr(ad.adbin, ad.adrelid) as default_expression,
      a.attidentity <> '' as is_identity,
      a.attgenerated <> '' as is_generated,
      col_description(a.attrelid, a.attnum) as description
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
    order by c.relname, a.attnum
  `);

  const constraintResult = await database.query(`
    select
      source.relname as table_name,
      con.conname as name,
      con.contype as type,
      pg_get_constraintdef(con.oid, true) as definition,
      target.relname as referenced_table,
      con.confupdtype as update_action_code,
      con.confdeltype as delete_action_code,
      con.condeferrable as is_deferrable,
      con.condeferred as is_initially_deferred
    from pg_constraint con
    join pg_class source on source.oid = con.conrelid
    join pg_namespace n on n.oid = source.relnamespace
    left join pg_class target on target.oid = con.confrelid
    where n.nspname = 'public'
    order by source.relname, con.contype, con.conname
  `);

  const constraintColumnResult = await database.query(`
    select
      source.relname as table_name,
      con.conname as constraint_name,
      source_column.attname as column_name,
      target.relname as referenced_table,
      target_column.attname as referenced_column,
      key_position.ordinality as position
    from pg_constraint con
    join pg_class source on source.oid = con.conrelid
    join pg_namespace n on n.oid = source.relnamespace
    join lateral unnest(con.conkey) with ordinality as key_position(attnum, ordinality) on true
    join pg_attribute source_column
      on source_column.attrelid = source.oid and source_column.attnum = key_position.attnum
    left join pg_class target on target.oid = con.confrelid
    left join lateral unnest(con.confkey) with ordinality as target_position(attnum, ordinality)
      on target_position.ordinality = key_position.ordinality
    left join pg_attribute target_column
      on target_column.attrelid = target.oid and target_column.attnum = target_position.attnum
    where n.nspname = 'public'
    order by source.relname, con.conname, key_position.ordinality
  `);

  const indexResult = await database.query(`
    select tablename as table_name, indexname as name, indexdef as definition
    from pg_indexes
    where schemaname = 'public'
    order by tablename, indexname
  `);

  const policyResult = await database.query(`
    select
      tablename as table_name,
      policyname as name,
      cmd as command,
      roles,
      qual as using_expression,
      with_check as check_expression
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `);

  const triggerResult = await database.query(`
    select
      c.relname as table_name,
      t.tgname as name,
      pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
    order by c.relname, t.tgname
  `);

  const viewResult = await database.query(`
    select
      c.relname as name,
      obj_description(c.oid, 'pg_class') as description,
      pg_get_viewdef(c.oid, true) as definition
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
    order by c.relname
  `);

  const viewColumnResult = await database.query(`
    select
      table_name,
      ordinal_position as ordinal,
      column_name as name,
      data_type,
      udt_name as underlying_type,
      is_nullable = 'YES' as nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        select table_name from information_schema.views where table_schema = 'public'
      )
    order by table_name, ordinal_position
  `);

  const enumResult = await database.query(`
    select t.typname as name, e.enumlabel as value, e.enumsortorder as sort_order
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    order by t.typname, e.enumsortorder
  `);

  const functionResult = await database.query(`
    select
      n.nspname as schema_name,
      p.proname as name,
      pg_get_function_identity_arguments(p.oid) as arguments,
      pg_get_function_result(p.oid) as result,
      obj_description(p.oid, 'pg_proc') as description
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
    order by n.nspname, p.proname, arguments
  `);

  const columnsByTable = groupBy(columnResult.rows, (column) => column.table_name);
  const constraintsByTable = groupBy(constraintResult.rows, (constraint) => constraint.table_name);
  const indexesByTable = groupBy(indexResult.rows, (index) => index.table_name);
  const policiesByTable = groupBy(policyResult.rows, (policy) => policy.table_name);
  const triggersByTable = groupBy(triggerResult.rows, (trigger) => trigger.table_name);

  const constraintColumnsByConstraint = groupBy(
    constraintColumnResult.rows,
    (column) => `${column.table_name}.${column.constraint_name}`,
  );

  const tables = tableResult.rows.map((table) => ({
    ...table,
    columns: columnsByTable[table.name] ?? [],
    constraints: (constraintsByTable[table.name] ?? []).map((constraint) => ({
      ...constraint,
      columns:
        constraintColumnsByConstraint[`${table.name}.${constraint.name}`]?.map(
          (column) => column.column_name,
        ) ?? [],
      referencedColumns:
        constraintColumnsByConstraint[`${table.name}.${constraint.name}`]?.map(
          (column) => column.referenced_column,
        ) ?? [],
    })),
    indexes: indexesByTable[table.name] ?? [],
    policies: policiesByTable[table.name] ?? [],
    triggers: triggersByTable[table.name] ?? [],
  }));

  const viewColumnsByView = groupBy(viewColumnResult.rows, (column) => column.table_name);
  const views = viewResult.rows.map((view) => ({
    ...view,
    columns: viewColumnsByView[view.name] ?? [],
  }));

  const enumValuesByName = groupBy(enumResult.rows, (value) => value.name);
  const enums = Object.entries(enumValuesByName).map(([name, values]) => ({
    name,
    values: values.map(({ value }) => value),
  }));

  return {
    tables,
    views,
    enums,
    functions: functionResult.rows,
  };
}
