<?php
// Authoritative SQL mutation path. Explicit migration/opt-in required; never
// mirror SQL playlist mutations into the unrelated JSON collection.
final class PlaylistSql {
    public static function enabled(): bool { return getenv('CACHYMUSIC_PLAYLIST_SQL') === '1'; }
    private static function query($conn,$sql,$types='',...$args) {
        $stmt=$conn->prepare($sql);if(!$stmt)throw new RuntimeException('Playlist SQL prepare failed');
        if($types!==''&&!$stmt->bind_param($types,...$args))throw new RuntimeException('Playlist SQL bind failed');
        if(!$stmt->execute())throw new RuntimeException('Playlist SQL execution failed');
        $result=$stmt->get_result();$rows=$result?$result->fetch_all(MYSQLI_ASSOC):[];$stmt->close();return $rows;
    }
    private static function validId($v): bool {return (is_int($v)||is_string($v))&&preg_match('/^[1-9][0-9]*$/D',(string)$v)&&filter_var($v,FILTER_VALIDATE_INT)!==false&&(int)$v<=2147483647;}
    private static function revision($v): bool {return (is_int($v)||is_string($v))&&preg_match('/^(0|[1-9][0-9]*)$/D',(string)$v)&&filter_var($v,FILTER_VALIDATE_INT)!==false;}
    private static function ids($values): array {
        if(!is_array($values))throw new InvalidArgumentException('Invalid membership');
        foreach($values as $v)if(!self::validId($v))throw new InvalidArgumentException('Invalid track identity');
        $ids=array_map('intval',$values);if(count(array_unique($ids))!==count($ids))throw new InvalidArgumentException('Duplicate membership');return $ids;
    }
    public static function mutate($conn,$action,$payload,$user) {
        if(!self::enabled()||!$conn)return false;
        // Refuse nontransactional engines and unmigrated schemas before writing.
        $engines=self::query($conn,"SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('Playlists','PlaylistTracks','Tracks','PlaylistAllocator')");
        if(count($engines)!==4||array_filter($engines,fn($r)=>strcasecmp($r['ENGINE'],'InnoDB')!==0))return false;
        if(!$conn->begin_transaction())return false;
        try {
            // All writers in this implementation serialize on the allocator row.
            $allocator=self::query($conn,'SELECT highwater FROM PlaylistAllocator WHERE singleton=1 FOR UPDATE');
            if(count($allocator)!==1)throw new RuntimeException('Playlist migration required');
            $id=$payload['plid']??null;$name=trim((string)($payload['name']??''));$revision=$payload['revision']??null;
            if($action==='create'){
                if($name===''||strlen($name)>200)throw new InvalidArgumentException('Invalid name');
                $tracks=self::ids($payload['tracks']??[]);
                $max=self::query($conn,'SELECT COALESCE(MAX(plid),0) AS maximum FROM Playlists');
                $id=max((int)$allocator[0]['highwater'],(int)$max[0]['maximum'])+1;
                if(!self::validId($id))throw new RuntimeException('Playlist ID space exhausted');
                self::query($conn,'UPDATE PlaylistAllocator SET highwater=? WHERE singleton=1','i',$id);
                self::query($conn,'INSERT INTO Playlists (plid,username,playlist_name,revision) VALUES (?,?,?,0)','iss',$id,$user,$name);
                $old=[];
            }else{
                if(!self::validId($id))throw new InvalidArgumentException('Invalid playlist ID');$id=(int)$id;
                $rows=self::query($conn,'SELECT playlist_name,username,revision FROM Playlists WHERE plid=? FOR UPDATE','i',$id);
                if(count($rows)!==1||!in_array($rows[0]['username'],[$user,'default'],true))throw new RuntimeException('Playlist not found');
                $row=$rows[0];$old=array_map(fn($r)=>(int)$r['tid'],self::query($conn,'SELECT tid FROM PlaylistTracks WHERE plid=? ORDER BY position,ptid FOR UPDATE','i',$id));
                if(in_array($action,['edit','edit_members','delete','add_tracks'],true)&&(!self::revision($revision)||(int)$revision!==(int)$row['revision']))throw new RuntimeException('Stale playlist revision');
                if($action==='delete'){
                    self::query($conn,'UPDATE PlaylistAllocator SET highwater=GREATEST(highwater,?) WHERE singleton=1','i',$id);
                    self::query($conn,'DELETE FROM PlaylistTracks WHERE plid=?','i',$id);self::query($conn,'DELETE FROM Playlists WHERE plid=?','i',$id);
                    if(!$conn->commit())throw new RuntimeException('Commit failed');return true;
                }
                if(in_array($action,['edit','edit_members'],true)){
                    $tracks=self::ids($payload['tracks']??null);$a=$old;$b=$tracks;sort($a);sort($b);if(($action==='edit'&&$a!==$b)||$name===''||strlen($name)>200)throw new InvalidArgumentException('Invalid edit');
                }elseif(in_array($action,['add_track','add_tracks'],true)){
                    $new=self::ids($action==='add_track'?[$payload['tid']??null]:($payload['tracks']??null));
                    if(!$new||array_intersect($old,$new)){$conn->rollback();return $action==='add_track'?'already_in_playlist':false;}
                    $tracks=array_merge($old,$new);$name=$row['playlist_name'];
                }elseif($action==='remove_track'){
                    $tid=$payload['tid']??null;if(!self::validId($tid)||!in_array((int)$tid,$old,true))throw new InvalidArgumentException('Unknown member');
                    $tracks=array_values(array_filter($old,fn($t)=>$t!==(int)$tid));$name=$row['playlist_name'];
                }else throw new InvalidArgumentException('Unsupported action');
            }
            foreach($tracks as $tid)if(count(self::query($conn,'SELECT tid FROM Tracks WHERE tid=? FOR UPDATE','i',$tid))!==1)throw new RuntimeException('Track unavailable');
            if($action!=='create')self::query($conn,'UPDATE Playlists SET playlist_name=?, revision=revision+1 WHERE plid=?','si',$name,$id);
            self::query($conn,'DELETE FROM PlaylistTracks WHERE plid=?','i',$id);
            foreach($tracks as $i=>$tid)self::query($conn,'INSERT INTO PlaylistTracks (plid,tid,position) VALUES (?,?,?)','iii',$id,$tid,$i+1);
            if(!$conn->commit())throw new RuntimeException('Commit failed');return $action==='create'?$id:true;
        }catch(Throwable $e){$conn->rollback();return false;}
    }
}
