// Rizzoma Extended by Yura Babak
// https://github.com/Inversion-des/Rizzoma-Extended

// ==UserScript==
// @name				Rizzoma Extended
// @description		Розширення додає поле для пошуку по сторінці на сервісі rizzoma.com
// @author				Yura Babak
// @namespace		Rizzoma
// @version        	0.8.2
// @include			https://rizzoma.com/*
// @run-at				document-body
// @updateURL	    https://github.com/Inversion-des/Rizzoma-Extended/raw/master/extended.meta.js
// @downloadURL	https://github.com/Inversion-des/Rizzoma-Extended/raw/master/extended.user.js
// @supportURL	    https://github.com/Inversion-des/Rizzoma-Extended/issues
// ==/UserScript==

"use strict";
!function(win) {
	if (window != window.top) return
	var doc = win.document
	var $ = win.jQuery
	var $win = $(win)
	
	// data
	var data = $.extend(true, {}, win.getWaveWithBlipsResults)
	var block_by_id_H = {}
	var index_blocks = function() {
		// get first wave data
		for (var k in data) {
			var wave = data[k]
			break
		}
		// кожен blip — це є окремий незалежний блок, який може редагуватися
		// спочатку проходимося, робимо базовий індекс
		$.each(wave.data.blips, function(i, blip) {
			//. skip root container
			if (blip.snapshot.isContainer) return true
			var block = {
				id: blip.docId,
				children_ids: [],
				parents: []
			}
			block_by_id_H[block.id] = block
		})
		// тепер аналізуємо контент кожного блока
		$.each(wave.data.blips, function(i, blip) {
			//. skip root container
			if (blip.snapshot.isContainer) return true
			
			var block = block_by_id_H[blip.docId]
			
			var text_parts = []
			$.each(blip.snapshot.content, function(i, part) {
				if (part.params.__TYPE == "TEXT") {
					text_parts.push(part.t)
				}
				else if (part.params.__TYPE == "BLIP") {
					text_parts.push('(+)')
					var id = part.params.__ID
					block.children_ids.push(id)
					var child_block = block_by_id_H[id]
					child_block.thread_id = part.params.__THREAD_ID
					child_block.parents = block.parents.concat(block)
				}
			})
			block.text = text_parts.join("\n").toLocaleLowerCase()
			block_by_id_H[block.id] = block
		})
		
		// detect big document
		tree.f_doc_is_big = Object.keys(block_by_id_H).length > 1000
	}
	setTimeout(index_blocks, 500)
	
	/////// ------- tree ------- ///////////////////////////////////////////////////////////////////////////////
	var tree = {}
	tree.nodes_with_hl = []
	tree.blips_with_matched = []
	tree.all_unfolded = []
	
	// tree.fold_all({in:cont})
	tree.fold_all = function(o) {
		o = o || {}
		var cont = o.in || $('.root-blip')
		
		// if folding all, not in container — clear unfolded markers
		if (!o.in) {
			$.each(tree.all_unfolded, function(i, plus) {
				delete plus._f_unfolded
			})
			tree.all_unfolded = []
		}
		
		cont.find('span.blip-thread:not(.folded)').each(function() { 
			var plus = this.rzBlipThread
			// skip (+) els wich were unfolded during unfold_all_to_target
			if (!plus._f_unfolded) plus.fold()
		})
	}
	
	// tree.unfold_all_to_target({id:'0_b_9bl0_83je6'})
	tree.unfold_all_to_target = function(o) {
		var id = o.id
		var next_block, res={}
		var target_block = block_by_id_H[id]
		var cur_container = $('.root-blip').parent()
		// process all the parents + target_block
		$.each(target_block.parents, function(i, block) {
			next_block = target_block.parents[i+1] || target_block
			
			// find and unfold proper (+) in the current container
			cur_container.find('span.blip-thread').each(function() {
				var plus = this.rzBlipThread
				var blips_cont = $(this).closest('.blips-container')
				// skip if it is not a child
				if (!blips_cont.is(cur_container[0])) return true
				
				if (plus._threadId == next_block.thread_id) {
					plus.unfold()
					// mark unfolded
					plus._f_unfolded = true
					tree.all_unfolded.push(plus)
					
					// mark parent container
					var blip = $(this).closest('.blip-container')
					blip[0]._f_has_matched = true
					blip.removeClass('RExt_blip_shaded')
					tree.blips_with_matched.push(blip)
					
					// shade all sibling blips
					cur_container.children('.blip-container').each(function(i, blip) {
						if (!blip._f_has_matched) {
							blip = $(blip)
							blip.addClass('RExt_blip_shaded')
						}
					})
					
					//. change current container
					cur_container = $(plus._blipsContainer)
					tree.fold_all({in:cur_container})
					
					// break
					return false
				}
			})
		})
		
		return {last_container:cur_container}
	}
	
	// tree.search_text({text:'__'})
	tree.search_text = function(o) {
		var text = o.text.toLocaleLowerCase()
		var res
		var rx = new RegExp('('+RegExp.escape(text)+')', 'ig')
		tree.fold_all()
		tree.clear_hl()
		var results_count = 0
		
		// for each block
		$.each(block_by_id_H, function(id, block) {
			if (block.text.indexOf(text)>-1) {
				res = tree.unfold_all_to_target({id:block.id})
				
				// process all the blips in container
				res.last_container.children('.blip-container').each(function(i, blip) {
					blip = $(blip)
					// (<!) process only target blip
					if (blip[0].__rizzoma_data_key.params.__ID != block.id) {
						if (!blip[0]._f_has_matched) blip.addClass('RExt_blip_shaded')
						return true
					}
					
					blip[0]._f_has_matched = true
					blip.removeClass('RExt_blip_shaded')
					tree.blips_with_matched.push(blip)
					
					var children = blip.find('> .js-editor-container > .js-editor').children('div, li').children(':not(.blip-thread)')
					children.each(function(i, node) {
						if (node._fv_ori_text) return true
						node = $(node)
						var node_text = node.html()
						if (node_text.toLocaleLowerCase().indexOf(text)<0) return true
						
						node[0]._fv_ori_text = node_text
						var node_text_with_hl = node_text.replace(rx, '<b class="RExt_text_hl">$1</b>')
						node.html(node_text_with_hl)
						
						// this data for text nodes used in api
						node.find('b')[0].data = text
						
						tree.nodes_with_hl.push(node)
					})
				})
			}
		})
	}
	tree.clear_node_hl = function(node) {
		node.html(node[0]._fv_ori_text)
		delete node[0]._fv_ori_text
	}
	tree.clear_hl = function(o) {
		$.each(tree.nodes_with_hl, function(i, node) {
			tree.clear_node_hl(node)
		})
		tree.nodes_with_hl = []
		
		$.each(tree.blips_with_matched, function(i, blip) {
			delete blip[0]._f_has_matched
		})
		tree.blips_with_matched = []
		
		$('.root-blip .RExt_blip_shaded').removeClass('RExt_blip_shaded')
		
		$win.trigger('tree.clear_hl')
	}
	/////// ------- /tree ------- ///////////////////////////////////////////////////////////////////////////////

	// export
	win.RExt_tree = tree
	win.RExt_block_by_id_H = block_by_id_H

	// -styles
	$('<style>\
		.RExt_search_cont {display: inline-block; position: absolute; top: 5px; right: 50px;}\
		.RExt_search_cont input {width:330px;background-color:#F6F6F6;padding:10px;padding-right:32px; border-radius: 5px; border: 1px solid #859099;}\
			.RExt_search_cont input:focus {background-color:#FFF;}\
				.RExt_search_cont input:focus::placeholder {opacity:0.2}\
					.RExt_search_cont input:focus::-moz-placeholder {opacity:0.2}\
					.RExt_search_cont input:focus::-webkit-input-placeholder {opacity:0.2}\
					.RExt_search_cont input:focus:-ms-input-placeholder {opacity:0.2}\
		.RExt_search_cont__x {display:none;position:absolute;top:0;right:0;padding:10px;cursor:pointer;font-size: 24px;line-height: 19px;}\
			.RExt_search_cont__x:hover {color:#BD2929;}\
		.RExt_text_hl {font-weight:normal;background-color:#FFFF00;}\
		.RExt_search_cont._showing_results input {background-color:#FFFFC7;}\
		.RExt_search_cont__results {display:none;position:absolute;left:-36px;width:30px;text-align:right;top:7px;color:#FFF;}\
		.RExt_blip_shaded {padding:0px;height:15px;opacity:0.4;min-height:0px;overflow:hidden;cursor:pointer;}\
		.RExt_blip_shaded * {cursor:pointer;}\
	</style>').appendTo('head')

	
	// DOM ready
	$(function() {
		
		// wait for header
		var header
		var check_dom = function() {
			header = $('.js-wave-header')
			header[0] ? $win.trigger('RExt_head_ready') : setTimeout(check_dom, 100)
		}
		check_dom()
		
		// on header ready
		$win.on('RExt_head_ready', function() {

			// search
			var search = {}
			search.cont = $('\
				<div class="RExt_search_cont">\
					<div class="RExt_search_cont__results">\
						<div class="RExt_search_cont__results__count"></div>\
					</div>\
					<input type="text" value="" placeholder="Пошук по сторінці" title="Hotkey: /" />\
					<div class="RExt_search_cont__x" title="Hotkey: Esc">×</div>\
				</div>\
			').hide().insertBefore(header.find('.js-settings-container')).delay(1000).fadeIn('slow')
			
			// input
			search.input = search.cont.find('input')
			var t_delayed_search = null
			search.input.on('input', function() {
				var val = search.input.val()
				search.x.toggle(!!val)
				clearTimeout(t_delayed_search)
				val = $.trim(val)
				if (val.length>1) {
					t_delayed_search = setTimeout(function() {
						// do search
						tree.search_text({text:val})
						search.cont.addClass('_showing_results')
						search.results.count.text(tree.nodes_with_hl.length)
						search.results.stop().fadeIn()
					}, 500)
				}
				else {
					tree.clear_hl()
				}
			})
			
			// X — clear search
			search.x = search.cont.find('.RExt_search_cont__x')
			search.x.on('click', function() {
				tree.clear_hl()
				search.input.val('').focus().triggerHandler('input')
			})
			
			// results
			search.results = search.cont.find('.RExt_search_cont__results')
			search.results.count = search.results.find('.RExt_search_cont__results__count')
			
			// -hot keys (-hotkeys)
			$win.on('keydown.RExt', function(e) {
				switch (e.which) {
					case $.key.Esc: 
						search.x.click()
						break
					case $.key.Slash:
					case $.key.Slash_cyr:
						if ($(doc.activeElement).is('input')) return true
						e.preventDefault()
						search.input.focus()
						break
				}
			})
			
			// for shared blips
			// on click — unshade
			$('.js-wave-content').on('mousedown', '.RExt_blip_shaded', function(e) {
				var blip = $(this)
				blip.removeClass('RExt_blip_shaded')
				return false
			})
			// on edit blip — clear any hl in nodes
			var cur_blip = $()
			$('.js-wave-content').on('mousedown', '.blip-container', function(e) {
				if (!e._f_blip_saved) cur_blip = $(this)
				e._f_blip_saved = true
			})
			setInterval(function() {
				if (cur_blip.is('.edit-mode')) {
					cur_blip.find('.RExt_text_hl').each(function() {
						var node = $(this).parent()
						tree.clear_node_hl(node)
						tree.nodes_with_hl.pull(node)
					})
				}
			}, 100)
			
			// other events
			$win.on('tree.clear_hl', function() {
				search.cont.removeClass('_showing_results')
				search.results.fadeOut()
			})
			
		}) // on header ready
		
	})	// DOM ready
	
	
	// helpers
	RegExp.escape = function(str) {
		return String(str).replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1')
	}

	$.key = {
		Esc: 27,
		Slash: 191,
		Slash_cyr: 190,
		Slash_num: 111,
		Down: 40,
		Up: 38,
		Left: 37,
		Right: 39,
		Tab: 9,
		Space: 32,
		PageUp: 33,
		PageDown: 34,
		Home: 36,
		End: 35,
		J: 74,
		K: 75,
		S: 83,
		Shift: 16,
		Ctrl: 17,
		Del: 46,
	}
	
	Array.prototype.pull = function() {
		var arg, args, index, j, len, output;
		args = 1 <= arguments.length ? [].slice.call(arguments, 0) : [];
		output = [];
		for (j = 0, len = args.length; j < len; j++) {
			arg = args[j];
			index = this.indexOf(arg);
			if (index !== -1) {
				output.push(this.splice(index, 1)[0]);
			}
		}
		if (args.length === 1) {
			output = output[0];
		}
		return output;
	};
	

}(typeof unsafeWindow == 'undefined' ? window : unsafeWindow)
