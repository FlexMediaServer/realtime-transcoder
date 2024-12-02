The player **MUST** purge the existing buffer if seeking outside the range of said buffer as there may be skipping at the segment boundaries.

Most players such as VLC and MPV already do this, however web based clients that use HLS.JS or DASH.JS may need additional logic to acomplish that.