import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { NextResponse } from 'next/server';

const CACHE_DIR = join(process.cwd(), '.cache');

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create cache directory:', error);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  
  if (!key) {
    return NextResponse.json({ error: 'No key provided' }, { status: 400 });
  }

  try {
    const filePath = join(CACHE_DIR, `${key}.json`);
    const data = await readFile(filePath, 'utf-8');
    return NextResponse.json({ data: JSON.parse(data) });
  } catch (_error) {
    return NextResponse.json({ error: 'Cache miss' }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const { key, data } = await request.json();

  if (!key || !data) {
    return NextResponse.json(
      { error: 'Missing key or data' },
      { status: 400 }
    );
  }

  await ensureCacheDir();

  try {
    const filePath = join(CACHE_DIR, `${key}.json`);
    await writeFile(filePath, JSON.stringify(data));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to write cache:', error);
    return NextResponse.json(
      { error: 'Failed to write cache' },
      { status: 500 }
    );
  }
} 
