/* eslint-disable no-undef */
// Import using ES modules for Vercel compatibility
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * API handler for saved books
 * @param {Request} request - The request object
 */
export default async function handler(request) {
  // Add comprehensive logging for debugging
  console.log('=== SAVED BOOKS API CALLED ===');
  console.log('Method:', request.method);
  console.log('URL:', request.url);
  console.log('Headers:', Object.fromEntries(request.headers.entries()));
  
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  try {
    // Dynamic imports for server modules
    const { storage } = await import('../server/storage.js');
    const { insertSavedBookSchema } = await import('../shared/schema.js');
    const { logDeviceOperation, logBookOperation } = await import('../server/utils/safe-logger.js');
    const { log } = await import('../server/simple-logger.js');

    // Parse request body for POST/PUT/DELETE requests
    let body = null;
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
      try {
        body = await request.json();
        console.log('Request body:', body);
      } catch (error) {
        console.error('Failed to parse request body:', error);
        return new Response(
          JSON.stringify({ error: 'Invalid JSON in request body' }),
          { status: 400, headers }
        );
      }
    }

    // Extract device ID from cookies or body
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [key, value] = c.trim().split('=');
        return [key, value];
      }).filter(([key]) => key)
    );
    
    const deviceId = body?.deviceId || cookies.deviceId;
    console.log('Device ID:', deviceId);

    if (request.method === 'GET') {
      if (!deviceId) {
        console.log('No device ID provided for GET request');
        return new Response(
          JSON.stringify({ books: [] }),
          { status: 200, headers }
        );
      }

      try {
        const books = await storage.getSavedBooksByDeviceId(deviceId);
        console.log('Retrieved saved books:', books?.length || 0);
        
        await logDeviceOperation(deviceId, 'get_saved_books', { 
          count: books?.length || 0 
        });
        
        return new Response(
          JSON.stringify({ books: books || [] }),
          { status: 200, headers }
        );
      } catch (error) {
        console.error('Error retrieving saved books:', error);
        await logDeviceOperation(deviceId, 'get_saved_books_error', { 
          error: error.message 
        });
        
        return new Response(
          JSON.stringify({ error: 'Failed to retrieve saved books' }),
          { status: 500, headers }
        );
      }
    }

    if (request.method === 'POST') {
      if (!body) {
        return new Response(
          JSON.stringify({ error: 'Request body is required' }),
          { status: 400, headers }
        );
      }

      try {
        const validatedData = insertSavedBookSchema.parse(body);
        console.log('Validated book data:', validatedData);

        // Generate ID if not provided
        if (!validatedData.id) {
          validatedData.id = uuidv4();
        }

        // Ensure device ID is set
        if (!validatedData.deviceId && deviceId) {
          validatedData.deviceId = deviceId;
        }

        if (!validatedData.deviceId) {
          return new Response(
            JSON.stringify({ error: 'Device ID is required' }),
            { status: 400, headers }
          );
        }

        const savedBook = await storage.saveBook(validatedData);
        console.log('Saved book:', savedBook);
        
        await logDeviceOperation(validatedData.deviceId, 'save_book', {
          bookId: savedBook.id,
          title: validatedData.title
        });
        
        await logBookOperation(savedBook.id, 'book_saved', {
          deviceId: validatedData.deviceId,
          title: validatedData.title
        });
        
        log.info('Book saved successfully', {
          deviceId: validatedData.deviceId,
          bookId: savedBook.id,
          title: validatedData.title
        });

        return new Response(
          JSON.stringify({ 
            message: 'Book saved successfully', 
            book: savedBook 
          }),
          { status: 201, headers }
        );
      } catch (validationError) {
        console.error('Validation error:', validationError);
        
        if (deviceId) {
          await logDeviceOperation(deviceId, 'save_book_validation_error', {
            error: validationError.message
          });
        }
        
        return new Response(
          JSON.stringify({ 
            error: 'Validation failed', 
            details: validationError.message 
          }),
          { status: 400, headers }
        );
      }
    }

    if (request.method === 'DELETE') {
      if (!body || !body.bookId) {
        return new Response(
          JSON.stringify({ error: 'Book ID is required for deletion' }),
          { status: 400, headers }
        );
      }

      if (!deviceId) {
        return new Response(
          JSON.stringify({ error: 'Device ID is required' }),
          { status: 400, headers }
        );
      }

      try {
        const deleted = await storage.deleteSavedBook(body.bookId, deviceId);
        
        if (deleted) {
          await logDeviceOperation(deviceId, 'delete_book', {
            bookId: body.bookId
          });
          
          await logBookOperation(body.bookId, 'book_deleted', {
            deviceId: deviceId
          });
          
          log.info('Book deleted successfully', {
            deviceId: deviceId,
            bookId: body.bookId
          });

          return new Response(
            JSON.stringify({ message: 'Book deleted successfully' }),
            { status: 200, headers }
          );
        } else {
          return new Response(
            JSON.stringify({ error: 'Book not found or not owned by this device' }),
            { status: 404, headers }
          );
        }
      } catch (error) {
        console.error('Error deleting book:', error);
        await logDeviceOperation(deviceId, 'delete_book_error', {
          bookId: body.bookId,
          error: error.message
        });
        
        return new Response(
          JSON.stringify({ error: 'Failed to delete book' }),
          { status: 500, headers }
        );
      }
    }

    // Method not allowed
    return new Response(
      JSON.stringify({ error: `Method ${request.method} not allowed` }),
      { status: 405, headers }
    );

  } catch (error) {
    console.error('Unexpected error in saved books API:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }),
      { status: 500, headers }
    );
  }
} 