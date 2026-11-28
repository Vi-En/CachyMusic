// Metadata editor owns the draft, lookup and commit lifecycle. Library refresh is injected.
import {requestServerMetadata} from './server-scan.js';
import {findTrackIndex} from './track-session.js';
import {rewriteMp4} from './mp4-tag-writer.js';
import {rewriteOgg} from './ogg-tag-writer.js';
import {rewritePcmContainer} from './container-tag-writer.js';
import {rewriteMp3} from './mp3-tag-writer.js';
import {rewriteFlac} from './flac-tag-writer.js';
import {resolveLocalFile} from './local-source.js';
import {requestProvider, metadataMatches, lyricMatches, MAX_LYRICS} from './metadata-providers.js';
import {prepareArtwork, validateImageBytes} from './artwork-validation.js';
import {escapeHtml, popModalState, pushModalState, showToast} from './utils.js';
import {store} from './state.js';
import {albumName, artistName, coverArtPreview, lyricsArtistName, lyricsTrackName, miniArtist, miniTitle, miniArtPreview, trackName} from './ui-elements.js';
import {updateLyricsDisplay} from './lyrics.js';
import {saveMetadataOverride} from './local-library.js';
import {getRuntime} from './runtime-capabilities.js';
import {mediaSessionController} from './media-session.js';
import {renderTrackMetadata, applyArtworkToDeck} from './player-presentation.js';
import {updateMarqueeText} from './player-marquee.js';

export function createMetadataEditor({getTrackKey, refreshLibrary, persistOverride = saveMetadataOverride}) {
    let saveInFlight = false;
    let pendingMetadataPayload = null;
    let pendingCover = null;
    let originalTrackCover = null;

    function updateTrackMetadataDisplay(track) {
        if (!track) return;
        renderTrackMetadata(track, false, () => {});
        if (coverArtPreview) coverArtPreview.src = track.cover || 'resources/images/default.svg';
    }

    function revertCover() {
        const thumb = document.getElementById('metaEditorThumb');
        const revertBtn = document.getElementById('metaEditorRevertCoverBtn');
        coverGeneration++;
        pendingCover = null;
        if (thumb && originalTrackCover) thumb.src = originalTrackCover;
        if (revertBtn) revertBtn.style.display = 'none';
        showToast('Reverted to original cover artwork');
    }

    let metadataGeneration = 0, coverGeneration = 0, lookupController = null;
    const metaEl = id => document.getElementById(id);
    function lookupStatus(message) { metaEl('metaLookupStatus').textContent = message; }
    function cancelLookup() { lookupController?.abort(); lookupController = null; if(metaEl('metaLookupCancelBtn')) metaEl('metaLookupCancelBtn').hidden = true; }
    function editorFields() {
        return {title:metaEl('metaEditTitle').value.trim(),artist:metaEl('metaEditArtist').value.trim(),album:metaEl('metaEditAlbum').value.trim(),genre:metaEl('metaEditGenre').value.trim(),year:metaEl('metaEditYear').value,track_num:metaEl('metaEditTrackNum').value,comment:metaEl('metaEditComment').value,lyrics:metaEl('metaEditLyrics').value};
    }
    async function handleCoverFileSelect(fileOrEvent) {
        const file = fileOrEvent?.target?.files?.[0] || fileOrEvent;
        if (!file || !store.state.currentEditingTrack) return;
        const generation = metadataGeneration, cover = ++coverGeneration;
        try {
            const prepared = await prepareArtwork(file);
            if(generation !== metadataGeneration || cover !== coverGeneration) return;
            pendingCover = {...prepared, source:'file', name:file.name || 'Selected artwork',preview:prepared.dataUrl};
            metaEl('metaEditorThumb').src = prepared.dataUrl;
            metaEl('metaEditorRevertCoverBtn').style.display = 'inline-flex';
            showToast('Artwork ready. Review and save to apply.');
        } catch (err) { if(generation === metadataGeneration && cover === coverGeneration) showToast(err.message || 'Could not process image.'); }
    }
    function renderLookupResults(kind, rows, generation) {
        const results = metaEl('metaLookupResults'); results.replaceChildren();
        for(const row of rows) {
            const card=document.createElement('div');card.className='metadataMatch';
            const title=document.createElement('strong');title.textContent=row.title || 'Unknown title';card.append(title);
            const info=document.createElement('p');info.textContent=[row.artist,row.album,row.year,row.duration ? `${Math.round(row.duration)} seconds` : ''].filter(Boolean).join(' · ');card.append(info);
            const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.className='actionBtn';b.textContent=label;b.addEventListener('click',()=>{if(generation===metadataGeneration)action();});card.append(b);};
            if(kind==='lyrics') button('Use lyrics',()=>{if(confirm('Only save or embed lyrics you have permission to use. Apply this result to the editor?'))metaEl('metaEditLyrics').value=row.lyrics;});
            else {
                button('Use tags',()=>{for(const [id,key] of [['metaEditTitle','title'],['metaEditArtist','artist'],['metaEditAlbum','album'],['metaEditYear','year']])if(row[key])metaEl(id).value=row[key];});
                button('Get cover',()=>runMetadataLookup('artwork',row));
            }
            results.append(card);
        }
        lookupStatus(rows.length ? `${rows.length} matches. Select the correct edition.` : 'No matches found. Try editing the search fields.');
    }
    async function runMetadataLookup(kind, selected = null) {
        if (!store.state.currentEditingTrack) return;
        const provider=kind==='metadata'?'MusicBrainz':kind==='artwork'?'Cover Art Archive / Internet Archive':'LRCLIB';
        const details=kind==='artwork'?'The selected release ID': 'The title, artist and album fields';
        if(!confirm(`${details} will be sent directly to ${provider}. The provider will receive your IP address. No music file or listening history is sent. Continue?`))return;
        cancelLookup(); const generation=metadataGeneration, controller=new AbortController();lookupController=controller;
        const artGeneration=kind==='artwork'?++coverGeneration:coverGeneration;
        metaEl('metaLookupCancelBtn').hidden=false;lookupStatus(`Searching ${provider}…`);
        try {
            const data=await requestProvider(kind,selected||editorFields(),controller.signal);
            if(controller.signal.aborted||generation!==metadataGeneration||lookupController!==controller)return;
            if(kind==='artwork') {
                const prepared=await prepareArtwork(data);
                if(controller.signal.aborted||generation!==metadataGeneration||artGeneration!==coverGeneration)return;
                pendingCover={...prepared,source:'provider',preview:prepared.dataUrl};metaEl('metaEditorThumb').src=prepared.dataUrl;metaEl('metaEditorRevertCoverBtn').style.display='inline-flex';
                lookupStatus('Artwork ready. Confirm you have permission to embed it before saving.');
            } else renderLookupResults(kind,kind==='metadata'?metadataMatches(data):lyricMatches(data),generation);
        } catch(err) { if(!controller.signal.aborted&&generation===metadataGeneration)lookupStatus(`Lookup unavailable: ${err.message}. You can still edit locally.`); }
        finally { if(lookupController===controller) {lookupController=null;metaEl('metaLookupCancelBtn').hidden=true;} }
    }
    function setupMetadataLookup() {
        metaEl('metaFindBtn')?.addEventListener('click',()=>runMetadataLookup('metadata'));
        metaEl('metaLyricsBtn')?.addEventListener('click',()=>runMetadataLookup('lyrics'));
        metaEl('metaLookupCancelBtn')?.addEventListener('click',()=>{cancelLookup();lookupStatus('Search cancelled.');});
        metaEl('metaLyricsFile')?.addEventListener('change',async e=>{
            const file=e.target.files?.[0], generation=metadataGeneration;e.target.value='';if(!file)return;
            if(file.size>MAX_LYRICS*4){showToast('Lyrics file is too large.');return;}
            try{const lyrics=await file.text();if(generation!==metadataGeneration)return;if(lyrics.length>MAX_LYRICS)throw Error('Lyrics exceed 65,536 characters.');metaEl('metaEditLyrics').value=lyrics;}catch(err){showToast(err.message);}
        });
        metaEl('metaExportFlacBtn')?.addEventListener('click',async()=>{
            const track=store.state.currentEditingTrack, generation=metadataGeneration;
            if(!track) return;
            const fields=editorFields(), selectedCover=pendingCover;
            try{
                const file=await resolveLocalFile(track);
                if(generation!==metadataGeneration)return;
                if(!file){showToast('Import the original audio file locally before exporting.');return;}
                let picture=null;
                if(selectedCover){const parts=selectedCover.dataUrl.split(',');const bytes=Uint8Array.from(atob(parts[1]),c=>c.charCodeAt(0));picture={...validateImageBytes(bytes),bytes};}
                const ext=(track.filename||file.name||'').split('.').at(-1).toLowerCase();
                const writer=ext==='mp3'?rewriteMp3:ext==='flac'?rewriteFlac:['m4a','alac'].includes(ext)?rewriteMp4:['ogg','opus','oga'].includes(ext)?rewriteOgg:['wav','wave','aif','aiff'].includes(ext)?rewritePcmContainer:null;
                if(!writer)throw Error('Unsupported tag export format');
                const result=await writer(file,fields,picture);
                if(generation!==metadataGeneration)return;
                // Browser download is a new copy; never overwrite the original. Android WebView download support varies.
                const url=URL.createObjectURL(result.blob), a=document.createElement('a');a.href=url;a.download=(track.filename||'track').replace(/\.[^.]+$/,'')+'-tagged.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
                showToast('Tagged copy prepared. Check your downloads.');
            }catch(err){showToast(err.message||'Could not export tagged audio.');}
        });
    }

    function openMetadataEditor(track) {
        const s = store.state;
        if (saveInFlight) { showToast('A metadata save is in progress.'); return; }
        if (!track) {
            showToast('No track selected to edit metadata.');
            return;
        }
        cancelLookup(); metadataGeneration++; coverGeneration++;
        metaEl('metaLookupResults')?.replaceChildren(); lookupStatus('');
        s.currentEditingTrack = track;
        pendingMetadataPayload = null;
        pendingCover = null;
        originalTrackCover = track.cover
            ? (track.cover.startsWith('data:') || track.cover.startsWith('blob:')
                ? track.cover
                : (track.cover + (track.cover.includes('?') ? '&thumb=1' : '?thumb=1')))
            : 'resources/images/default.svg';

        const modal = document.getElementById('metadataEditorModal');
        const thumb = document.getElementById('metaEditorThumb');
        const fileTitle = document.getElementById('metaEditorFileTitle');
        const filePath = document.getElementById('metaEditorFilePath');
        const formatPill = document.getElementById('metaEditorFormatPill');
        const bitratePill = document.getElementById('metaEditorBitratePill');
        const sampleRatePill = document.getElementById('metaEditorSampleRatePill');
        const bitDepthPill = document.getElementById('metaEditorBitDepthPill');
        const statusEl = document.getElementById('metaEditorStatus');
        const form = document.getElementById('metaEditorForm');
        const confirmCard = document.getElementById('metaEditorConfirmCard');
        const saveBtn = document.getElementById('metaEditSaveBtn');
        const proceedBtn = document.getElementById('metaEditConfirmProceedBtn');
        const cancelConfirmBtn = document.getElementById('metaEditConfirmCancelBtn');
        const revertCoverBtn = document.getElementById('metaEditorRevertCoverBtn');

        const inputTitle = document.getElementById('metaEditTitle');
        const inputArtist = document.getElementById('metaEditArtist');
        const inputAlbum = document.getElementById('metaEditAlbum');
        const inputGenre = document.getElementById('metaEditGenre');
        const inputYear = document.getElementById('metaEditYear');
        const inputTrackNum = document.getElementById('metaEditTrackNum');
        const inputComment = document.getElementById('metaEditComment');

        if (!modal) return;

        if (confirmCard) confirmCard.style.display = 'none';
        if (form) form.style.display = 'block';
        const lookupPanel = metaEl('metaLookupStatus')?.closest('.metadataLookup'); if(lookupPanel) lookupPanel.hidden = false;
        if (revertCoverBtn) revertCoverBtn.style.display = 'none';

        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Review changes';
        }
        if (proceedBtn) {
            proceedBtn.disabled = false;
            proceedBtn.textContent = 'Save changes';
        }
        if (cancelConfirmBtn) cancelConfirmBtn.disabled = false;
        if (thumb) thumb.src = originalTrackCover;
        if (fileTitle) fileTitle.textContent = track.title || track.filename || 'Untitled Track';
        if (filePath) filePath.textContent = track.fullPath || track.filename || 'Local Audio Track';
        if (formatPill) formatPill.textContent = (track.format || 'AUDIO').toUpperCase();
        if (bitratePill) bitratePill.textContent = track.bitrate ? `${track.bitrate} kbps` : 'N/A';
        if (sampleRatePill) {
            const sr = track.sampleRate;
            sampleRatePill.textContent = sr ? (sr >= 1000 ? `${(sr / 1000).toFixed(1)} kHz` : `${sr} Hz`) : 'Not reported';
        }
        if (bitDepthPill) {
            const bd = track.bitDepth || null;
            bitDepthPill.textContent = bd ? `${bd}-bit` : 'Not reported';
        }
        if (statusEl) {
            statusEl.style.display = 'none';
            statusEl.textContent = '';
            statusEl.className = 'metaEditorStatus';
        }

        if (inputTitle) inputTitle.value = track.title || '';
        if (inputArtist) inputArtist.value = track.artist || '';
        if (inputAlbum) inputAlbum.value = track.album || '';
        if (inputGenre) inputGenre.value = track.genre || '';
        if (inputYear) inputYear.value = (track.year && track.year > 0) ? track.year : '';
        if (inputTrackNum) inputTrackNum.value = (track.track || track.track_num) ? (track.track || track.track_num) : '';
        if (inputComment) inputComment.value = track.comment || '';
        metaEl('metaEditLyrics').value = track.lyrics || '';
        metaEl('metaWriteFile').checked=false;
        metaEl('metaWriteFileRow').hidden=!(getRuntime().hasPhpBackend&&track.tid&&!String(track.tid).startsWith('local_')&&/\.(flac|mp3|wav|wave|aif|aiff|ogg|opus|oga|m4a|alac)$/i.test(track.filename||''));
        metaEl('metaExportFlacBtn').hidden = getRuntime().isAndroidNative || !(track._fileBlob||track.opfsKey||track.fileBlob) || !/\.(flac|mp3|wav|wave|aif|aiff|ogg|opus|oga|m4a|alac)$/i.test(track.filename || '');

        modal.style.display = 'flex';
        pushModalState('metadataEditorModal');

        if (window.innerWidth > 768 && inputTitle) {
            const generation = metadataGeneration;
            setTimeout(() => {
                if (generation !== metadataGeneration) return;
                try {
                    inputTitle.focus();
                    inputTitle.select();
                } catch (_) {}
            }, 60);
        }

    }

    function closeMetadataEditor() {
        cancelLookup(); metadataGeneration++; coverGeneration++;
        const modal = document.getElementById('metadataEditorModal');
        if (modal) modal.style.display = 'none';
        const confirmCard = document.getElementById('metaEditorConfirmCard');
        const form = document.getElementById('metaEditorForm');
        const revertBtn = document.getElementById('metaEditorRevertCoverBtn');
        if (confirmCard) confirmCard.style.display = 'none';
        if (form) form.style.display = 'block';
        const lookupPanel = metaEl('metaLookupStatus')?.closest('.metadataLookup'); if(lookupPanel) lookupPanel.hidden = false;
        if (revertBtn) revertBtn.style.display = 'none';

        popModalState('metadataEditorModal');
        store.state.currentEditingTrack = null;
        pendingMetadataPayload = null;
        pendingCover = null;
        originalTrackCover = null;
    }

    function requestSaveMetadataConfirmation(e) {
        const s = store.state;
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (!s.currentEditingTrack || saveInFlight) return;

        const inputTitle = document.getElementById('metaEditTitle');
        const inputArtist = document.getElementById('metaEditArtist');
        const inputAlbum = document.getElementById('metaEditAlbum');
        const inputGenre = document.getElementById('metaEditGenre');
        const inputYear = document.getElementById('metaEditYear');
        const inputTrackNum = document.getElementById('metaEditTrackNum');
        const inputComment = document.getElementById('metaEditComment');
        const statusEl = document.getElementById('metaEditorStatus');
        const form = document.getElementById('metaEditorForm');
        const confirmCard = document.getElementById('metaEditorConfirmCard');
        const confirmSummary = document.getElementById('metaEditorConfirmSummary');
        const confirmDesc = document.getElementById('metaEditorConfirmDesc');

        const newTitle = (inputTitle ? inputTitle.value : '').trim();
        if (!newTitle) {
            if (statusEl) {
                statusEl.textContent = 'Track title cannot be empty.';
                statusEl.className = 'metaEditorStatus error';
                statusEl.style.display = 'block';
            }
            if (inputTitle) inputTitle.focus();
            return;
        }

        const newArtist = (inputArtist ? inputArtist.value : '').trim();
        const newAlbum = (inputAlbum ? inputAlbum.value : '').trim();
        const newGenre = (inputGenre ? inputGenre.value : '').trim();
        const newYear = inputYear && inputYear.value ? parseInt(inputYear.value, 10) : null;
        const newTrackNum = inputTrackNum?.value.trim() || null;
        if (newTrackNum && (newTrackNum.length > 50 || /[\x00-\x1f\x7f]/.test(newTrackNum))) { showToast('Enter a valid track number (up to 50 characters).'); inputTrackNum.focus(); return; }
        for (const input of [inputYear]) {
            if (input?.value && (!input.checkValidity() || !/^\d+$/.test(input.value))) {
                showToast('Enter a valid whole number for year.');
                input.focus(); return;
            }
        }
        const newComment = (inputComment ? inputComment.value : '').trim();
        const track = s.currentEditingTrack;
        const newLyrics = metaEl('metaEditLyrics').value;
        if(newLyrics.length > MAX_LYRICS){showToast('Lyrics are too long.');return;}

        const changes = [];
        const origTitle = (track.title || '').trim();
        const origArtist = (track.artist || '').trim();
        const origAlbum = (track.album || '').trim();
        const origGenre = (track.genre || '').trim();
        const origYear = (track.year && track.year > 0) ? parseInt(track.year, 10) : null;
        const origTrackNum = String(track.track ?? track.track_num ?? '').trim() || null;
        const origComment = (track.comment || '').trim();

        if (newTitle !== origTitle) changes.push({ field: 'Title', from: origTitle || '(empty)', to: newTitle });
        if (newArtist !== origArtist) changes.push({ field: 'Artist', from: origArtist || '(empty)', to: newArtist || '(empty)' });
        if (newAlbum !== origAlbum) changes.push({ field: 'Album', from: origAlbum || '(empty)', to: newAlbum || '(empty)' });
        if (newGenre !== origGenre) changes.push({ field: 'Genre', from: origGenre || '(empty)', to: newGenre || '(empty)' });
        if (newYear !== origYear) changes.push({ field: 'Year', from: origYear ? String(origYear) : '(empty)', to: newYear ? String(newYear) : '(empty)' });
        if (newTrackNum !== origTrackNum) changes.push({ field: 'Track #', from: origTrackNum ? String(origTrackNum) : '(empty)', to: newTrackNum ? String(newTrackNum) : '(empty)' });
        if (newComment !== origComment) changes.push({ field: 'Comment', from: origComment || '(empty)', to: newComment || '(empty)' });

        if(newLyrics !== (track.lyrics || '')) changes.push({field:'Lyrics',from:'Original lyrics',to:newLyrics ? 'Updated lyrics' : 'Removed lyrics'});
        if (pendingCover && pendingCover.preview && pendingCover.preview !== originalTrackCover) {
            changes.push({
                field: 'Cover Art',
                isCover: true,
                from: originalTrackCover || 'resources/images/default.svg',
                to: pendingCover.preview
            });
        }

        pendingMetadataPayload = {
            newTitle,
            newArtist,
            newAlbum,
            newGenre,
            newYear,
            newTrackNum,
            newComment,
            newLyrics,
            pendingCover,
            writeFile: !metaEl('metaWriteFileRow').hidden && metaEl('metaWriteFile').checked,
            targetTrack: track
        };

        if (confirmDesc) {
            confirmDesc.textContent = `Save ${changes.length} tag change${changes.length === 1 ? '' : 's'} for "${origTitle || track.filename || 'track'}"? ${pendingMetadataPayload.writeFile ? "The original audio file will also be modified without re-encoding." : "Only the local library will be updated."}`;
        }

        if (confirmSummary) {
            if (changes.length === 0) {
                confirmSummary.innerHTML = '<div class="metaEditNoChanges">No library fields changed. File tags have not been verified.</div>';
            } else {
                confirmSummary.innerHTML = changes.map(ch => {
                    if (ch.isCover) {
                        return `
                            <div class="metaEditChangeRow metaEditCoverChangeRow">
                                <span class="metaEditChangeField">${escapeHtml(ch.field)}</span>
                                <span class="metaEditCoverPreviewCon">
                                    <img id="metaEditMiniThumbOrig" src="${escapeHtml(ch.from)}" class="metaEditMiniThumb" alt="Original Cover">
                                    <span class="metaEditChangeArrow" aria-hidden="true">➔</span>
                                    <img id="metaEditMiniThumbNew" src="${escapeHtml(ch.to)}" class="metaEditMiniThumb" alt="New Cover">
                                </span>
                            </div>
                        `;
                    }
                    return `
                        <div class="metaEditChangeRow">
                            <span class="metaEditChangeField">${escapeHtml(ch.field)}</span>
                            <span class="metaEditChangeFrom" title="${escapeHtml(ch.from)}">${escapeHtml(ch.from)}</span>
                            <span class="metaEditChangeArrow" aria-hidden="true">➔</span>
                            <span class="metaEditChangeTo" title="${escapeHtml(ch.to)}">${escapeHtml(ch.to)}</span>
                        </div>
                    `;
                }).join('');
            }
        }

        cancelLookup(); coverGeneration++;
        const lookupPanel = metaEl('metaLookupStatus')?.closest('.metadataLookup'); if(lookupPanel) lookupPanel.hidden = true;
        if (form) form.style.display = 'none';
        if (confirmCard) confirmCard.style.display = 'flex';
        const card = document.getElementById('metaEditorCard');
        if (card) card.scrollTop = 0;
        metaEl('metaEditConfirmCancelBtn')?.focus();
    }

    function cancelMetadataConfirmation() {
        if (saveInFlight) return;
        pendingMetadataPayload = null;
        const form = document.getElementById('metaEditorForm');
        const confirmCard = document.getElementById('metaEditorConfirmCard');
        if (confirmCard) confirmCard.style.display = 'none';
        if (form) form.style.display = 'block';
        const lookupPanel = metaEl('metaLookupStatus')?.closest('.metadataLookup'); if(lookupPanel) lookupPanel.hidden = false;
        metaEl('metaEditSaveBtn')?.focus();
    }

    async function executeSaveMetadata() {
        if (saveInFlight) { showToast('A metadata save is already in progress.'); return; }
        if (!pendingMetadataPayload) return;
        saveInFlight = true;
        const generation = metadataGeneration;
        try { await commitMetadata(); }
        catch (error) { showToast(error?.message || 'Could not save metadata.'); }
        finally {
            saveInFlight = false;
            if (generation === metadataGeneration) {
                const proceed = metaEl('metaEditConfirmProceedBtn');
                if (proceed) { proceed.disabled = false; proceed.textContent = 'Save changes'; }
                const cancel = metaEl('metaEditConfirmCancelBtn');
                if (cancel) cancel.disabled = false;
            }
        }
    }

    async function commitMetadata() {
        const s = store.state;
        const saveGeneration = metadataGeneration;
        if (!pendingMetadataPayload || !pendingMetadataPayload.targetTrack) {
            cancelMetadataConfirmation();
            return;
        }

        const {
            newTitle,
            newArtist,
            newAlbum,
            newGenre,
            newYear,
            newTrackNum,
            newComment,
            newLyrics,
            pendingCover: chosenCover,
            writeFile,
            targetTrack
        } = pendingMetadataPayload;

        const proceedBtn = document.getElementById('metaEditConfirmProceedBtn');
        const cancelConfirmBtn = document.getElementById('metaEditConfirmCancelBtn');

        if (proceedBtn) {
            proceedBtn.disabled = true;
            proceedBtn.textContent = 'SAVING...';
        }
        if (cancelConfirmBtn) cancelConfirmBtn.disabled = true;

        const coverDataPayload = chosenCover?.dataUrl || null;

        // Rewriting the actively playing source can invalidate incremental PCM ranges.
        const current = s.currentTrack || s.allTracks?.[s.currentTrackIndex];
        if (writeFile && (s.isPlaying || s.isSoftwareDecoding) && current && findTrackIndex([current],targetTrack)===0) {
            showToast('Stop playback of this recording before writing its original file.');
            return;
        }
        let backendStatus = '';
        const tid = targetTrack.tid || targetTrack.id || null;
        if (getRuntime().hasPhpBackend && tid && !String(tid).startsWith('local_') && typeof fetch === 'function') {
            try {
                const postPayload = {
                    tid,
                    write_file: Boolean(writeFile),
                    title: newTitle,
                    artist: newArtist,
                    album: newAlbum,
                    genre: newGenre,
                    year: newYear,
                    track_num: newTrackNum,
                    comment: newComment,
                    lyrics: newLyrics
                };
                if (coverDataPayload && coverDataPayload.startsWith('data:image/')) {
                    postPayload.cover_data = coverDataPayload;
                }
                const result = await requestServerMetadata(postPayload);
                if (!result?.success) { showToast(result?.message || 'Backend save rejected. No local override applied.'); return; }
                backendStatus = writeFile ? (result.tagWriteSuccess ? ' · file tags written' : ' · library saved; original file not written') : '';
            } catch (netErr) {
                showToast(netErr?.message || 'Backend outcome unconfirmed. Refresh the library before retrying.');
                return;
            }
        }

        const updatedFields = {
            title: newTitle,
            artist: newArtist,
            album: newAlbum,
            genre: newGenre,
            year: newYear,
            track: newTrackNum,
            track_num: newTrackNum,
            comment: newComment,
            lyrics: newLyrics
        };
        if (coverDataPayload) {
            updatedFields.cover = coverDataPayload;
            updatedFields.coverThumb=null;updatedFields.coverKey=null;
            updatedFields.has_cover = 1;
            updatedFields.hasCover = true;
        }

        Object.assign(targetTrack, updatedFields);

        const updateInList = (list) => {
            if (!Array.isArray(list)) return;
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                if (findTrackIndex([t], targetTrack) === 0) {
                    Object.assign(t, updatedFields);
                }
            }
        };

        updateInList(s.allTracks);
        updateInList(s.displayedTracks);
        updateInList(s.playQueue);

        const savedOverride = await persistOverride(getTrackKey(targetTrack), updatedFields);
        // Overrides persist per track; no full-library rewrite for a single edit.
        if(!savedOverride)showToast('Metadata could not be saved locally.');

        const activeTrack = s.currentTrack || s.allTracks?.[s.currentTrackIndex] || null;
        const isCurrentPlaying = activeTrack && findTrackIndex([activeTrack], targetTrack) === 0;

        if (isCurrentPlaying) {
            updateMarqueeText(trackName, newTitle);
            updateMarqueeText(artistName, newArtist || 'Unknown Artist');
            updateMarqueeText(albumName, newAlbum || 'Unknown Album');
            if (lyricsTrackName) lyricsTrackName.textContent = newTitle;
            if (lyricsArtistName) lyricsArtistName.textContent = newArtist || 'Unknown Artist';
            updateMarqueeText(miniTitle, newTitle);
            updateMarqueeText(miniArtist, newArtist || 'Unknown Artist');

            if (coverDataPayload) {
                applyArtworkToDeck(coverDataPayload, true);
                if (miniArtPreview) miniArtPreview.src = coverDataPayload;
            }
            mediaSessionController.updateMetadata(targetTrack);
            updateLyricsDisplay(targetTrack);
        }

        if (!s.currentInspectedTrack || findTrackIndex([s.currentInspectedTrack], targetTrack) === 0) updateTrackMetadataDisplay(targetTrack);
        refreshLibrary();
        store.emit('library:update-queue');
        if(saveGeneration === metadataGeneration) closeMetadataEditor();
        showToast(`${savedOverride ? 'Library metadata saved' : 'Local persistence failed; changes may be temporary'}${backendStatus}`);
    }

    let bound = false;
    function bindMetadataEditor() {
        if (bound) return;
        bound = true;
        const on = (id, type, fn) => metaEl(id)?.addEventListener(type, fn);
        const pickCover = () => metaEl('metaEditorCoverFileInput')?.click();
        on('metaEditorUploadOverlayBtn', 'click', pickCover);
        on('metaEditorBrowseCoverBtn', 'click', pickCover);
        on('metaEditorCoverFileInput', 'change', event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleCoverFileSelect(file);
        });
        on('metaEditorRevertCoverBtn', 'click', revertCover);
        on('closeMetaEditorModalBtn', 'click', closeMetadataEditor);
        on('metaEditCancelBtn', 'click', closeMetadataEditor);
        on('metaEditorForm', 'submit', requestSaveMetadataConfirmation);
        on('metaEditConfirmCancelBtn', 'click', cancelMetadataConfirmation);
        on('metaEditConfirmProceedBtn', 'click', () => void executeSaveMetadata());
        on('metadataEditorModal', 'click', event => {
            if (event.target === event.currentTarget) closeMetadataEditor();
        });
        on('infoPanelEditMetaBtn', 'click', () => {
            const s = store.state;
            openMetadataEditor(s.currentInspectedTrack || s.currentTrack || s.allTracks?.[s.currentTrackIndex]);
        });
        setupMetadataLookup();
    }

    function saveMetadata(e) {
        return requestSaveMetadataConfirmation(e);
    }

    return {bindMetadataEditor, setupMetadataLookup, updateTrackMetadataDisplay, revertCover, handleCoverFileSelect, openMetadataEditor, closeMetadataEditor, requestSaveMetadataConfirmation, cancelMetadataConfirmation, executeSaveMetadata, saveMetadata};
}
