-- El bucket público solo recibe láminas JPEG de hasta 2 MB; el privado, imágenes de trabajo.
update storage.buckets set allowed_mime_types = array['image/jpeg'], file_size_limit = 2000000 where id = 'laminas-publicadas';
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp'], file_size_limit = 10000000 where id = 'imagenes-privadas';
