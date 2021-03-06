/*

Z-Machine UI
============

Copyright (c) 2016 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

Note: is used by both ZVM and Gnusto. In the case of Gnusto the engine is actually GnustoRunner.
	The engine must have a StructIO modified env

*/

var utils = require( '../common/utils.js' ),
Class = utils.Class;

module.exports = Class.subClass({

	init: function( engine )
	{
		this.e = engine;
		this.buffer = '';

		// Use the requested formatter (classes is default)
		utils.extend( this, this.formatters[engine.env.formatter] || {} );

		// TODO: why is this debug?
		if ( this.e.env.debug )
		{
			this.reverse = 0;
			this.bold = 0;
			this.italic = 0;
			this.fg = undefined;
			this.bg = undefined;
		}
		// Version 3 time header bit
		this.time = engine.m.getUint8( 0x01 ) & 0x02;
		// A variable for whether we are outputing in a monospaced font. If non-zero then we are
		// Bit 0 is for @set_style, bit 1 for the header, and bit 2 for @set_font
		this.mono = engine.m.getUint8( 0x11 ) & 0x02;

		this.process_colours();

		// Upper window stuff
		this.currentwin = 0;
		this.status = []; // Status window orders

		// Construct the basic windows
		engine.orders.push(
			{
				code: 'stream',
				name: 'status',
			},
			{
				code: 'stream',
				name: 'main',
			},
			{
				code: 'find',
				name: 'main',
			}
		);
	},

	// Clear the lower window
	clear_window: function()
	{
		this.e.orders.push({
			code: 'clear',
			name: 'main',
			bg: this.bg,
		});
	},

	erase_line: function( value )
	{
		if ( value === 1 )
		{
			this.flush();
			this.status.push( { code: 'eraseline' } );
		}
	},

	erase_window: function( window )
	{
		this.flush();
		if ( window < 1 )
		{
			this.clear_window();
		}
		if ( window === -1 )
		{
			this.split_window( 0 );
		}
		if ( window === -2 || window === 1 )
		{
			this.status.push( { code: 'clear' } );
		}
	},

	// Flush the buffer to the orders
	flush: function()
	{
		// If we have a buffer transfer it to the orders
		if ( this.buffer !== '' )
		{
			var order = {
				code: 'stream',
				text: this.buffer,
				props: this.format(),
			};

			( this.currentwin ? this.status : this.e.orders ).push( order );
			this.buffer = '';
		}
	},

	format: function()
	{
		var props = {},
		temp,
		classes = [],
		fg = this.fg,
		bg = this.bg;

		if ( this.bold )
		{
			classes.push( 'zvm-bold' );
		}
		if ( this.italic )
		{
			classes.push( 'zvm-italic' );
		}
		if ( this.mono )
		{
			classes.push( 'zvm-mono' );
		}
		if ( this.reverse )
		{
			temp = fg;
			fg = bg || this.env.bg;
			bg = temp || this.env.fg;
		}
		if ( typeof fg !== 'undefined' )
		{
			if ( isNaN( fg ) )
			{
				props.css = { color: fg };
			}
			else
			{
				classes.push( 'zvm-fg-' + fg );
			}
		}
		if ( typeof bg !== 'undefined' )
		{
			if ( isNaN( bg ) )
			{
				if ( !props.css )
				{
					props.css = {};
				}
				props.css['background-color'] = bg;
			}
			else
			{
				classes.push( 'zvm-bg-' + bg );
			}
		}
		if ( classes.length )
		{
			props['class'] = classes.join( ' ' );
		}
		return props;
	},

	get_cursor: function( array )
	{
		// act() will flush
		this.status.push({
			code: 'get_cursor',
			addr: array,
		});
		this.e.act();
	},

	// Process CSS default colours
	process_colours: function()
	{
		// Convert RGB to a Z-Machine true colour
		// RGB is a css colour code. rgb(), #000000 and #000 formats are supported.
		function convert_RGB( code )
		{
			var round = Math.round,
			data = /(\d+),\s*(\d+),\s*(\d+)|#(\w{1,2})(\w{1,2})(\w{1,2})/.exec( code ),
			result;

			// Nice rgb() code
			if ( data[1] )
			{
				result =  [ data[1], data[2], data[3] ];
			}
			else
			{
				// Messy CSS colour code
				result = [ parseInt( data[4], 16 ), parseInt( data[5], 16 ), parseInt( data[6], 16 ) ];
				// Stretch out compact #000 codes to their full size
				if ( code.length === 4 )
				{
					result = [ result[0] << 4 | result[0], result[1] << 4 | result[1], result[2] << 4 | result[2] ];
				}
			}

			// Convert to a 15bit colour
			return round( result[2] / 8.226 ) << 10 | round( result[1] / 8.226 ) << 5 | round( result[0] / 8.226 );
		}

		// Standard colours
		var colours = [
			0xFFFE, // Current
			0xFFFF, // Default
			0x0000, // Black
			0x001D, // Red
			0x0340, // Green
			0x03BD, // Yellow
			0x59A0, // Blue
			0x7C1F, // Magenta
			0x77A0, // Cyan
			0x7FFF, // White
			0x5AD6, // Light grey
			0x4631, // Medium grey
			0x2D6B,  // Dark grey
		],

		// Start with CSS colours provided by the runner
		fg_css = this.e.env.fgcolour,
		bg_css = this.e.env.bgcolour,
		// Convert to true colour for storing in the header
		fg_true = fg_css ? convert_RGB( fg_css ) : 0xFFFF,
		bg_true = bg_css ? convert_RGB( bg_css ) : 0xFFFF,
		// Search the list of standard colours
		fg = colours.indexOf( fg_true ),
		bg = colours.indexOf( bg_true );
		// ZVMUI must have colours for reversing text, even if we don't write them to the header
		// So use the given colours or assume black on white
		if ( fg < 2 )
		{
			fg = fg_css || 2;
		}
		if ( bg < 2 )
		{
			bg = bg_css || 9;
		}

		this.env = {
			fg: fg,
			bg: bg,
			fg_true: fg_true,
			bg_true: bg_true,
		};
	},

	set_colour: function( foreground, background )
	{
		this.flush();
		if ( foreground === 1 )
		{
			this.fg = undefined;
		}
		if ( foreground > 1 && foreground < 13 )
		{
			this.fg = foreground;
		}
		if ( background === 1 )
		{
			this.bg = undefined;
		}
		if ( background > 1 && background < 13 )
		{
			this.bg = background;
		}
	},

	set_cursor: function( row, col )
	{
		this.flush();
		this.status.push({
			code: 'cursor',
			to: [row - 1, col - 1],
		});
	},

	set_font: function( font )
	{
		// We only support fonts 1 and 4
		if ( font !== 1 && font !== 4 )
		{
			return 0;
		}
		var returnval = this.mono & 0x04 ? 4 : 1;
		if ( font !== returnval )
		{
			this.flush();
			this.mono ^= 0x04;
		}
		return returnval;
	},

	// Set styles
	set_style: function( stylebyte )
	{
		this.flush();

		// Setting the style to Roman will clear the others
		if ( stylebyte === 0 )
		{
			this.reverse = this.bold = this.italic = 0;
			this.mono &= 0xFE;
		}
		if ( stylebyte & 0x01 )
		{
			this.reverse = 1;
		}
		if ( stylebyte & 0x02 )
		{
			this.bold = 1;
		}
		if ( stylebyte & 0x04 )
		{
			this.italic = 1;
		}
		if ( stylebyte & 0x08 )
		{
			this.mono |= 0x01;
		}
	},

	// Set true colours
	set_true_colour: function( foreground, background )
	{
		// Convert a 15 bit colour to RGB
		function convert_true_colour( colour )
		{
			// Stretch the five bits per colour out to 8 bits
			var newcolour = Math.round( ( colour & 0x1F ) * 8.226 ) << 16
				| Math.round( ( ( colour & 0x03E0 ) >> 5 ) * 8.226 ) << 8
				| Math.round( ( ( colour & 0x7C00 ) >> 10 ) * 8.226 );
			newcolour = newcolour.toString( 16 );
			// Ensure the colour is 6 bytes long
			while ( newcolour.length < 6 )
			{
				newcolour = '0' + newcolour;
			}
			return '#' + newcolour;
		}

		this.flush();

		if ( foreground === 0xFFFF )
		{
			this.fg = undefined;
		}
		else if ( foreground < 0x8000 )
		{
			this.fg = convert_true_colour( foreground );
		}

		if ( background === 0xFFFF )
		{
			this.bg = undefined;
		}
		else if ( background < 0x8000 )
		{
			this.bg = convert_true_colour( background );
		}
	},

	set_window: function( window )
	{
		this.flush();
		this.currentwin = window;
		this.e.orders.push({
			code: 'find',
			name: window ? 'status' : 'main',
		});
		if ( window )
		{
			this.status.push({
				code: 'cursor',
				to: [0, 0],
			});
		}
	},

	split_window: function( lines )
	{
		this.flush();
		this.status.push({
			code: 'height',
			lines: lines,
		});
		// 8.6.1.1.2
		if ( this.e.version3 )
		{
			this.status.push( { code: 'clear' } );
		}
	},

	// Update ZVM's header with correct colour information
	// If colours weren't provided then the default colour will be used for both
	update_header: function()
	{
		var memory = this.e.m;
		memory.setUint8( 0x2C, isNaN( this.env.bg ) ? 1 : this.env.bg );
		memory.setUint8( 0x2D, isNaN( this.env.fg ) ? 1 : this.env.fg );
		this.e.extension_table( 5, this.env.fg_true );
		this.e.extension_table( 6, this.env.bg_true );
	},

	// Output the version 3 status line
	v3_status: function()
	{
		var engine = this.e,
		width = engine.env.width,
		hours_score = engine.m.getUint16( engine.globals + 2 ),
		mins_turns = engine.m.getUint16( engine.globals + 4 ),
		rhs;
		this.set_window( 1 );
		this.set_style( 1 );
		engine._print( Array( width + 1 ).join( ' ' ) );
		this.set_cursor( 1, 1 );

		// Handle the turns/score or time
		if ( this.time )
		{
			rhs = 'Time: ' + ( hours_score % 12 === 0 ? 12 : hours_score % 12 ) + ':' + ( mins_turns < 10 ? '0' : '' ) + mins_turns + ' ' + ( hours_score > 11 ? 'PM' : 'AM' );
		}
		else
		{
			rhs = 'Score: ' + hours_score + '  Turns: ' + mins_turns;
		}

		engine.print( 3, engine.m.getUint16( engine.globals ) );
		// this.buffer now has the room name, so ensure it is not too long
		this.buffer = ' ' + this.buffer.slice( 0, width - rhs.length - 4 );

		this.set_cursor( 1, width - rhs.length );
		engine._print( rhs );
		this.set_style( 0 );
		this.set_window( 0 );
	},

	// Formatters allow you to change how styles are marked
	// The desired formatter should be passed in through env
	formatters: {},
});
