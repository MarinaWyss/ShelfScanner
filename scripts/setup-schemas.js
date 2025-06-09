import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

async function setupSchemas() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Setting up database schemas...');
    
    // Create development schema if it doesn't exist
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS development;
    `);
    console.log('✅ Development schema created/verified');

    // Ensure public schema exists (it should by default)
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS public;
    `);
    console.log('✅ Public schema verified');

    // Set proper permissions (optional, but good practice)
    await pool.query(`
      GRANT USAGE ON SCHEMA development TO postgres;
      GRANT CREATE ON SCHEMA development TO postgres;
      GRANT USAGE ON SCHEMA public TO postgres;
      GRANT CREATE ON SCHEMA public TO postgres;
    `);
    console.log('✅ Schema permissions set');

    console.log('\n🎉 Schema setup complete!');
    console.log('📝 You can now run:');
    console.log('   npm run db:push:dev    # Push to development schema');
    console.log('   npm run db:push:prod   # Push to public schema');
    
  } catch (error) {
    console.error('❌ Error setting up schemas:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

setupSchemas().catch(console.error); 